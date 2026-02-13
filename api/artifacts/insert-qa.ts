import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { hasSubstantiveQAContent } from './_validation.js'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from './_shared.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      title?: string
      body_md?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const body_md = typeof body.body_md === 'string' ? body.body_md : undefined

    // Log artifact creation request for tracing
    console.log(`[insert-qa] Artifact creation request: ticketId=${ticketId}, title="${title}", body_md length=${body_md?.length ?? 'undefined'}`)

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!ticketId || !title || !body_md) {
      json(res, 400, {
        success: false,
        error: 'ticketId, title, and body_md are required.',
      })
      return
    }

    // Validate that body_md contains substantive QA report content
    // Use QA-specific validation that accepts structured reports with sections/tables/lists
    const contentValidation = hasSubstantiveQAContent(body_md, title)
    console.log(`[insert-qa] Content validation: valid=${contentValidation.valid}, reason=${contentValidation.reason || 'none'}, body_md length=${body_md?.length ?? 'undefined'}`)
    if (!contentValidation.valid) {
      json(res, 400, {
        success: false,
        error: contentValidation.reason || 'Artifact body must contain substantive QA report content, not just a title or placeholder text.',
        validation_failed: true,
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get ticket to retrieve pk and repo_full_name
    const ticketNumber = parseInt(ticketId, 10)
    if (!Number.isFinite(ticketNumber)) {
      json(res, 400, {
        success: false,
        error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
      })
      return
    }

    // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, display_id')
      .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
      .maybeSingle()

    if (ticketError || !ticket) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId} not found in Supabase.`,
      })
      return
    }

    // Normalize title to use ticket's display_id for consistent formatting (0121)
    const displayId = (ticket as { display_id?: string }).display_id || ticketId
    const canonicalTitle = createCanonicalTitle('qa-report', displayId)
    
    // Find existing artifacts by canonical identifier (ticket_pk + agent_type + artifact_type)
    // instead of exact title match to handle different title formats (0121)
    const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
      supabase,
      ticket.pk,
      'qa',
      'qa-report'
    )

    if (findError) {
      json(res, 200, {
        success: false,
        error: findError,
      })
      return
    }

    const artifacts = (existingArtifacts || []) as Array<{
      artifact_id: string
      body_md?: string
      created_at: string
    }>

    // Separate artifacts into those with content and empty/placeholder ones
    const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
    const emptyArtifactIds: string[] = []

    for (const artifact of artifacts) {
      const currentBody = artifact.body_md || ''
      // Use QA-specific validation for consistency
      const currentValidation = hasSubstantiveQAContent(currentBody, canonicalTitle)
      if (currentValidation.valid) {
        artifactsWithContent.push({
          artifact_id: artifact.artifact_id,
          created_at: artifact.created_at,
        })
      } else {
        emptyArtifactIds.push(artifact.artifact_id)
      }
    }

    // Delete all empty/placeholder artifacts to clean up duplicates
    if (emptyArtifactIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('agent_artifacts')
        .delete()
        .in('artifact_id', emptyArtifactIds)

      if (deleteError) {
        // Log but don't fail - we can still proceed with update/insert
        console.warn(`[insert-qa] Failed to delete empty artifacts: ${deleteError.message}`)
      }
    }

    // Determine which artifact to update (prefer the most recent one with content, or most recent overall)
    let targetArtifactId: string | null = null
    if (artifactsWithContent.length > 0) {
      // Use the most recent artifact that has content
      targetArtifactId = artifactsWithContent[0].artifact_id
    } else if (artifacts.length > 0) {
      // If all were empty and we deleted them, we'll insert a new one
      // But if there's still one left (race condition), use it
      const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
      if (remaining.length > 0) {
        targetArtifactId = remaining[0].artifact_id
      }
    }

    if (targetArtifactId) {
      // Delete ALL other artifacts with the same canonical type (different title formats) (0121)
      const duplicateIds = artifacts
        .map((a) => a.artifact_id)
        .filter((id) => id !== targetArtifactId && !emptyArtifactIds.includes(id))
      
      if (duplicateIds.length > 0) {
        const { error: deleteDuplicateError } = await supabase
          .from('agent_artifacts')
          .delete()
          .in('artifact_id', duplicateIds)

        if (deleteDuplicateError) {
          // Log but don't fail - we can still proceed with update
          console.warn(`[insert-qa] Failed to delete duplicate artifacts: ${deleteDuplicateError.message}`)
        }
      }

      // Append to existing artifact instead of replacing (0137: preserve history when tickets are reworked)
      const existingArtifact = artifacts.find((a) => a.artifact_id === targetArtifactId)
      const existingBody = existingArtifact?.body_md || ''
      const timestamp = new Date().toISOString()
      const separator = '\n\n---\n\n'
      const appendedBody = existingBody.trim()
        ? `${existingBody.trim()}${separator}**Update (${timestamp}):**\n\n${body_md}`
        : body_md // If existing body is empty, just use new body
      
      console.log(`[insert-qa] Appending to artifact ${targetArtifactId} (existing length=${existingBody.length}, new length=${body_md.length})`)
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title: canonicalTitle, // Use canonical title for consistency
          body_md: appendedBody,
        })
        .eq('artifact_id', targetArtifactId)

      if (updateError) {
        console.error(`[insert-qa] Update failed: ${updateError.message}`)
        json(res, 200, {
          success: false,
          error: `Failed to update artifact: ${updateError.message}`,
        })
        return
      }

      // Verify the update by reading back the artifact
      const { data: updatedArtifact, error: readError } = await supabase
        .from('agent_artifacts')
        .select('body_md')
        .eq('artifact_id', targetArtifactId)
        .single()
      
      if (readError) {
        console.warn(`[insert-qa] Failed to read back updated artifact: ${readError.message}`)
      } else {
        const persistedLength = updatedArtifact?.body_md?.length ?? 0
        console.log(`[insert-qa] Artifact updated successfully. Persisted body_md length=${persistedLength}`)
      }

      json(res, 200, {
        success: true,
        artifact_id: targetArtifactId,
        action: 'updated',
        cleaned_up_duplicates: emptyArtifactIds.length + duplicateIds.length,
      })
      return
    }

    // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
    console.log(`[insert-qa] Inserting new artifact with body_md length=${body_md.length}`)
    const { data: inserted, error: insertError } = await supabase
      .from('agent_artifacts')
      .insert({
        ticket_pk: ticket.pk,
        repo_full_name: ticket.repo_full_name || '',
        agent_type: 'qa',
        title: canonicalTitle, // Use canonical title for consistency
        body_md,
      })
      .select('artifact_id')
      .single()

    if (insertError) {
      // Handle race condition: if duplicate key error, try to find and update the existing artifact
      if (insertError.message.includes('duplicate') || insertError.code === '23505') {
        const { data: existingArtifact, error: findError } = await supabase
          .from('agent_artifacts')
          .select('artifact_id')
          .eq('ticket_pk', ticket.pk)
          .eq('agent_type', 'qa')
          .eq('title', title)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!findError && existingArtifact?.artifact_id) {
          const { error: updateError } = await supabase
            .from('agent_artifacts')
            .update({ body_md })
            .eq('artifact_id', existingArtifact.artifact_id)

          if (!updateError) {
            json(res, 200, {
              success: true,
              artifact_id: existingArtifact.artifact_id,
              action: 'updated',
              cleaned_up_duplicates: emptyArtifactIds.length,
              race_condition_handled: true,
            })
            return
          }
        }
      }

      console.error(`[insert-qa] Insert failed: ${insertError.message}`)
      json(res, 200, {
        success: false,
        error: `Failed to insert artifact: ${insertError.message}`,
      })
      return
    }

    // Verify the insert by reading back the artifact
    const insertedId = inserted.artifact_id
    const { data: insertedArtifact, error: readError } = await supabase
      .from('agent_artifacts')
      .select('body_md')
      .eq('artifact_id', insertedId)
      .single()
    
    if (readError) {
      console.warn(`[insert-qa] Failed to read back inserted artifact: ${readError.message}`)
    } else {
      const persistedLength = insertedArtifact?.body_md?.length ?? 0
      console.log(`[insert-qa] Artifact inserted successfully. Persisted body_md length=${persistedLength}`)
    }

    json(res, 200, {
      success: true,
      artifact_id: inserted.artifact_id,
      action: 'inserted',
      cleaned_up_duplicates: emptyArtifactIds.length,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

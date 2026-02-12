import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { hasSubstantiveContent, isEmptyOrPlaceholder } from './_validation'

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
      artifactType?: string
      title?: string
      body_md?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
    const artifactType = typeof body.artifactType === 'string' ? body.artifactType.trim() : undefined
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const body_md = typeof body.body_md === 'string' ? body.body_md : undefined

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

    if (!ticketId || !artifactType || !title || !body_md) {
      json(res, 400, {
        success: false,
        error: 'ticketId, artifactType, title, and body_md are required.',
      })
      return
    }

    // Validate that body_md contains substantive content
    const contentValidation = hasSubstantiveContent(body_md, title)
    if (!contentValidation.valid) {
      json(res, 400, {
        success: false,
        error: contentValidation.reason || 'Artifact body must contain substantive content, not just a title or placeholder text.',
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

    // Find ALL existing artifacts with the same title (to handle duplicates)
    const { data: existingArtifacts, error: findError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, body_md, created_at')
      .eq('ticket_pk', ticket.pk)
      .eq('agent_type', 'implementation')
      .eq('title', title)
      .order('created_at', { ascending: false })

    if (findError) {
      json(res, 200, {
        success: false,
        error: `Failed to query existing artifacts: ${findError.message}`,
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
      if (isEmptyOrPlaceholder(artifact.body_md, title)) {
        emptyArtifactIds.push(artifact.artifact_id)
      } else {
        artifactsWithContent.push({
          artifact_id: artifact.artifact_id,
          created_at: artifact.created_at,
        })
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
        console.warn(`[insert-implementation] Failed to delete empty artifacts: ${deleteError.message}`)
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
      // Update the target artifact
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title,
          body_md,
        })
        .eq('artifact_id', targetArtifactId)

      if (updateError) {
        json(res, 200, {
          success: false,
          error: `Failed to update artifact: ${updateError.message}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        artifact_id: targetArtifactId,
        action: 'updated',
        cleaned_up_duplicates: emptyArtifactIds.length,
      })
      return
    }

    // No existing artifact found (or all were deleted), insert new one
    const { data: inserted, error: insertError } = await supabase
      .from('agent_artifacts')
      .insert({
        ticket_pk: ticket.pk,
        repo_full_name: ticket.repo_full_name || '',
        agent_type: 'implementation',
        title,
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
          .eq('agent_type', 'implementation')
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

      json(res, 200, {
        success: false,
        error: `Failed to insert artifact: ${insertError.message}`,
      })
      return
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

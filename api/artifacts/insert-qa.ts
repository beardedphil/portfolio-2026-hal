import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { hasSubstantiveQAContent } from './_validation.js'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from './_shared.js'
import { logStorageAttempt } from './_log-attempt.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let totalLength = 0
  const maxBodySize = 10 * 1024 * 1024 // 10MB limit
  
  try {
    for await (const chunk of req) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      totalLength += buffer.length
      if (totalLength > maxBodySize) {
        throw new Error(`Request body too large: ${totalLength} bytes (max: ${maxBodySize} bytes)`)
      }
      chunks.push(buffer)
    }
  } catch (readError) {
    console.error(`[insert-qa] Error reading request body: ${readError instanceof Error ? readError.message : String(readError)}`)
    throw new Error(`Failed to read request body: ${readError instanceof Error ? readError.message : String(readError)}`)
  }
  
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw || raw.trim().length === 0) {
    console.warn(`[insert-qa] Empty request body received`)
    return {}
  }
  
  try {
    const parsed = JSON.parse(raw) as unknown
    console.log(`[insert-qa] Successfully parsed JSON body: ${raw.length} bytes`)
    return parsed
  } catch (parseError) {
    console.error(`[insert-qa] JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    console.error(`[insert-qa] Raw body length: ${raw.length}, first 500 chars: ${raw.substring(0, 500)}`)
    console.error(`[insert-qa] Last 500 chars: ${raw.substring(Math.max(0, raw.length - 500))}`)
    throw new Error(`Failed to parse request body as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
  }
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
    
    // Robust body_md extraction: handle string, null, undefined, and convert non-strings to string
    let body_md: string | undefined
    if (body.body_md === null || body.body_md === undefined) {
      body_md = undefined
    } else if (typeof body.body_md === 'string') {
      body_md = body.body_md // Keep as-is, even if empty (validation will catch empty strings)
    } else {
      // Convert non-string to string (handles numbers, objects, etc.)
      try {
        body_md = String(body.body_md)
      } catch (convertError) {
        console.error(`[insert-qa] Failed to convert body_md to string: ${convertError instanceof Error ? convertError.message : String(convertError)}`)
        body_md = undefined
      }
    }

    // Log artifact creation request for tracing
    console.log(`[insert-qa] Artifact creation request: ticketId=${ticketId}, title="${title}", body_md type=${typeof body.body_md}, body_md length=${body_md?.length ?? 'undefined'}`)
    
    // Additional validation: ensure body_md is actually a string and not empty
    if (body_md === undefined || typeof body_md !== 'string' || body_md.length === 0) {
      const errorMsg = body_md === undefined 
        ? 'body_md is required and must be provided in the request body'
        : typeof body_md !== 'string'
        ? `body_md must be a string, received ${typeof body.body_md}`
        : 'body_md must be a non-empty string'
      console.error(`[insert-qa] Invalid body_md: ${errorMsg}, body_md type=${typeof body.body_md}, body_md value=${body.body_md !== undefined && body.body_md !== null ? String(body.body_md).substring(0, 100) : 'null/undefined'}`)
      json(res, 400, {
        success: false,
        error: errorMsg,
        validation_failed: true,
        validation_reason: errorMsg,
      })
      return
    }

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
      // Log request failure attempt (0175)
      await logStorageAttempt(
        supabase,
        '', // No ticket PK available
        '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'request failed',
        `Ticket ${ticketId} not found in Supabase.`
      )
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId} not found in Supabase.`,
      })
      return
    }

    // Validate that body_md contains substantive QA report content (after we have ticket for logging)
    // Use QA-specific validation that accepts structured reports with sections/tables/lists
    // Ensure body_md is a valid string before validation
    if (!body_md || typeof body_md !== 'string') {
      const errorMsg = 'body_md is required and must be a string'
      console.error(`[insert-qa] ${errorMsg}: body_md type=${typeof body_md}, value=${body_md?.substring(0, 100) ?? 'null/undefined'}`)
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'rejected by validation',
        errorMsg,
        errorMsg
      )
      json(res, 400, {
        success: false,
        error: errorMsg,
        validation_failed: true,
        validation_reason: errorMsg,
      })
      return
    }
    
    const contentValidation = hasSubstantiveQAContent(body_md, title)
    console.log(`[insert-qa] Content validation: valid=${contentValidation.valid}, reason=${contentValidation.reason || 'none'}, body_md length=${body_md.length}`)
    if (!contentValidation.valid) {
      const validationReason = contentValidation.reason || 'Artifact body must contain substantive QA report content (minimum 100 characters, not just placeholder text)'
      // Log validation failure attempt (0175)
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'rejected by validation',
        validationReason,
        validationReason
      )
      json(res, 400, {
        success: false,
        error: validationReason,
        validation_failed: true,
        validation_reason: validationReason, // Include validation reason for UI display
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
      // Log request failure attempt (0175)
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'request failed',
        findError
      )
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
      // But replace if existing body is empty/placeholder (0197: prevent shell artifacts)
      const existingArtifact = artifacts.find((a) => a.artifact_id === targetArtifactId)
      const existingBody = existingArtifact?.body_md || ''
      
      // Check if existing body is substantive using validation
      const existingValidation = hasSubstantiveQAContent(existingBody, canonicalTitle)
      const shouldAppend = existingValidation.valid && existingBody.trim().length > 0
      
      let finalBody: string
      if (shouldAppend) {
        // Existing body is substantive, append new content
        const timestamp = new Date().toISOString()
        const separator = '\n\n---\n\n'
        finalBody = `${existingBody.trim()}${separator}**Update (${timestamp}):**\n\n${body_md}`
      } else {
        // Existing body is empty/placeholder, replace it entirely (0197)
        finalBody = body_md
      }
      
      console.log(`[insert-qa] ${shouldAppend ? 'Appending to' : 'Replacing'} artifact ${targetArtifactId} (existing length=${existingBody.length}, new length=${body_md.length})`)
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title: canonicalTitle, // Use canonical title for consistency
          body_md: finalBody,
        })
        .eq('artifact_id', targetArtifactId)

      if (updateError) {
        console.error(`[insert-qa] Update failed: ${updateError.message}`)
        // Log request failure attempt (0175)
        await logStorageAttempt(
          supabase,
          ticket.pk,
          ticket.repo_full_name || '',
          'qa-report',
          'qa',
          '/api/artifacts/insert-qa',
          'request failed',
          `Failed to update artifact: ${updateError.message}`
        )
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

      // Log successful storage attempt (0175)
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'stored'
      )
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
        console.log(`[insert-qa] Race condition detected: duplicate key error, attempting to find and update existing artifact`)
        // Try to find by canonical identifier instead of exact title match
        const { artifacts: raceArtifacts, error: raceFindError } = await findArtifactsByCanonicalId(
          supabase,
          ticket.pk,
          'qa',
          'qa-report'
        )
        
        if (!raceFindError && raceArtifacts && raceArtifacts.length > 0) {
          // Use the most recent artifact
          const targetArtifact = raceArtifacts[0]
          const existingRaceBody = (targetArtifact as { body_md?: string }).body_md || ''
          
          // Check if existing body is substantive - if not, replace it entirely (0197)
          const existingRaceValidation = hasSubstantiveQAContent(existingRaceBody, canonicalTitle)
          const shouldAppendRace = existingRaceValidation.valid && existingRaceBody.trim().length > 0
          
          let finalRaceBody: string
          if (shouldAppendRace) {
            // Existing body is substantive, append new content
            const timestamp = new Date().toISOString()
            const separator = '\n\n---\n\n'
            finalRaceBody = `${existingRaceBody.trim()}${separator}**Update (${timestamp}):**\n\n${body_md}`
          } else {
            // Existing body is empty/placeholder, replace it entirely (0197)
            finalRaceBody = body_md
          }
          
          const { error: updateError } = await supabase
            .from('agent_artifacts')
            .update({ 
              title: canonicalTitle, // Use canonical title for consistency
              body_md: finalRaceBody
            })
            .eq('artifact_id', targetArtifact.artifact_id)

          if (!updateError) {
            // Log successful storage attempt (0175)
            await logStorageAttempt(
              supabase,
              ticket.pk,
              ticket.repo_full_name || '',
              'qa-report',
              'qa',
              '/api/artifacts/insert-qa',
              'stored'
            )
            json(res, 200, {
              success: true,
              artifact_id: targetArtifact.artifact_id,
              action: 'updated',
              cleaned_up_duplicates: emptyArtifactIds.length,
              race_condition_handled: true,
            })
            return
          }
        }
      }

      console.error(`[insert-qa] Insert failed: ${insertError.message}`)
      // Log request failure attempt (0175)
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        'qa-report',
        'qa',
        '/api/artifacts/insert-qa',
        'request failed',
        `Failed to insert artifact: ${insertError.message}`
      )
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

    // Log successful storage attempt (0175)
    await logStorageAttempt(
      supabase,
      ticket.pk,
      ticket.repo_full_name || '',
      'qa-report',
      'qa',
      '/api/artifacts/insert-qa',
      'stored'
    )
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

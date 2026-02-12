import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 */
function hasSubstantiveContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Remove markdown headings and check remaining content
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '') // Remove markdown headings
    .replace(/^[-*+]\s+.*$/gm, '') // Remove bullet points (might be just placeholder bullets)
    .replace(/^\d+\.\s+.*$/gm, '') // Remove numbered lists
    .trim()

  // If after removing headings and lists, there's no content, it's invalid
  if (withoutHeadings.length === 0) {
    return {
      valid: false,
      reason: 'Artifact body contains only headings or placeholder structure. Artifacts must include substantive content beyond the title.',
    }
  }

  // Check if content is just the title repeated or very short
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalizedBody = body_md.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // If body is essentially just the title, it's invalid
  if (normalizedBody.length < 50 && normalizedBody.includes(normalizedTitle)) {
    return {
      valid: false,
      reason: 'Artifact body is too short or only contains the title. Artifacts must include detailed content (at least 50 characters of substantive text).',
    }
  }

  // Check for common placeholder patterns
  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m, // Just a single heading
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return {
        valid: false,
        reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual implementation details, not placeholders.',
      }
    }
  }

  // Minimum length check (after removing headings)
  if (withoutHeadings.length < 30) {
    return {
      valid: false,
      reason: `Artifact body is too short (${withoutHeadings.length} characters after removing headings). Artifacts must contain at least 30 characters of substantive content.`,
    }
  }

  return { valid: true }
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

    // Check if artifact already exists
    const { data: existing } = await supabase
      .from('agent_artifacts')
      .select('artifact_id')
      .eq('ticket_pk', ticket.pk)
      .eq('agent_type', 'implementation')
      .eq('title', title)
      .maybeSingle()

    if (existing) {
      // Prevent overwriting existing artifacts with empty content
      // Fetch current body_md to compare
      const { data: currentArtifact } = await supabase
        .from('agent_artifacts')
        .select('body_md')
        .eq('artifact_id', existing.artifact_id)
        .single()

      const currentBody = (currentArtifact as { body_md?: string })?.body_md || ''
      const currentValidation = hasSubstantiveContent(currentBody, title)
      
      // If existing artifact has content but new one doesn't, reject the update
      if (currentValidation.valid && !contentValidation.valid) {
        json(res, 400, {
          success: false,
          error: `Cannot overwrite existing artifact with empty/placeholder content. Existing artifact has substantive content. ${contentValidation.reason || ''}`,
          validation_failed: true,
          existing_artifact_has_content: true,
        })
        return
      }

      // Update existing artifact
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title,
          body_md,
        })
        .eq('artifact_id', existing.artifact_id)

      if (updateError) {
        json(res, 200, {
          success: false,
          error: `Failed to update artifact: ${updateError.message}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        artifact_id: existing.artifact_id,
        action: 'updated',
      })
      return
    }

    // Insert new artifact
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
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

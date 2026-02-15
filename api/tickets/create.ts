import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import {
  readJsonBody,
  json,
  slugFromTitle,
  repoHintPrefix,
  isUniqueViolation,
  parseSupabaseCredentials,
  generateTicketBody,
} from './_shared.js'

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
      sourceTicketId?: string
      sourceTicketPk?: string
      suggestions?: string[]
      suggestion?: string // Single suggestion for one-ticket-per-suggestion mode (0167)
      reviewId?: string // Process Review run ID for idempotency (0167)
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const sourceTicketPk = typeof body.sourceTicketPk === 'string' ? body.sourceTicketPk.trim() : undefined
    const sourceTicketId = typeof body.sourceTicketId === 'string' ? body.sourceTicketId.trim() : undefined
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : undefined
    // Support both single suggestion (new) and array of suggestions (legacy)
    const singleSuggestion = typeof body.suggestion === 'string' ? body.suggestion.trim() : undefined
    const suggestions = singleSuggestion 
      ? [singleSuggestion] 
      : Array.isArray(body.suggestions) 
        ? body.suggestions.filter((s) => typeof s === 'string' && s.trim()) 
        : []

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'sourceTicketPk (preferred) or sourceTicketId, and Supabase credentials are required.',
      })
      return
    }

    if (suggestions.length === 0) {
      json(res, 400, {
        success: false,
        error: 'At least one suggestion is required to create a ticket.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch source ticket to get repo info
    const sourceTicketQuery = sourceTicketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('pk', sourceTicketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('id', sourceTicketId!).maybeSingle()

    if (sourceTicketQuery.error || !sourceTicketQuery.data) {
      json(res, 200, {
        success: false,
        error: `Source ticket not found: ${sourceTicketQuery.error?.message || 'Unknown error'}`,
      })
      return
    }

    const sourceTicket = sourceTicketQuery.data
    const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
    const prefix = repoHintPrefix(repoFullName)

    // Idempotency check: if single suggestion is provided, check if ticket with same suggestion already exists (0167, 0172)
    // We check by suggestion hash + source ticket to prevent duplicates even if Process Review runs multiple times
    if (singleSuggestion) {
      // Normalize suggestion text (trim) to ensure consistent hashing with ticket creation (0172)
      const normalizedSuggestion = singleSuggestion.trim()
      const suggestionHash = crypto.createHash('sha256').update(normalizedSuggestion).digest('hex').slice(0, 16)
      // Match both stored formats: "- **Suggestion Hash**: hash" and "**Suggestion Hash**: hash"
      const hashPattern = `Suggestion Hash**: ${suggestionHash}`
      const sourceRef = sourceTicket.display_id || sourceTicket.id
      // Match both stored formats: "- **Proposed from**: ..." and "**Proposed from**: ..."
      const sourcePattern = `Proposed from**: ${sourceRef} — Process Review`
      
      // Check for existing ticket with same suggestion hash and source ticket
      const { data: existingTickets } = await supabase
        .from('tickets')
        .select('pk, id, display_id')
        .eq('repo_full_name', repoFullName)
        .like('body_md', `%${sourcePattern}%`)
        .like('body_md', `%${hashPattern}%`)
        .limit(1)

      if (existingTickets && existingTickets.length > 0) {
        json(res, 200, {
          success: true,
          ticketId: existingTickets[0].display_id || existingTickets[0].id,
          id: existingTickets[0].id,
          pk: existingTickets[0].pk,
          duplicate: true,
        })
        return
      }
    }

    // Determine next ticket number (repo-scoped)
    let startNum = 1
    try {
      const { data: existingRows, error: fetchError } = await supabase
        .from('tickets')
        .select('ticket_number')
        .eq('repo_full_name', repoFullName)
        .order('ticket_number', { ascending: false })
        .limit(1)

      if (!fetchError && existingRows && existingRows.length > 0) {
        const maxNum = (existingRows[0] as { ticket_number?: number }).ticket_number ?? 0
        startNum = maxNum + 1
      }
    } catch {
      // Fallback to 1 if query fails
    }

    // Generate ticket content from suggestions
    // Support both single suggestion field (new) and single-item array (backward compatibility) (0167)
    const sourceRef = sourceTicket.display_id || sourceTicket.id
    const isSingleSuggestion = singleSuggestion !== undefined || suggestions.length === 1
    const actualSuggestion = singleSuggestion || (suggestions.length === 1 ? suggestions[0] : '')
    // Normalize suggestion text (trim) to ensure consistent hashing with idempotency check (0172)
    const normalizedSuggestion = actualSuggestion.trim()
    const suggestionText = isSingleSuggestion ? normalizedSuggestion : suggestions.map((s) => `- ${s}`).join('\n')
    
    // Generate suggestion hash for idempotency tracking (0167, 0172)
    // Always generate hash for single suggestions to enable duplicate detection
    // Use normalized (trimmed) suggestion to match idempotency check
    const suggestionHash = isSingleSuggestion && normalizedSuggestion
      ? crypto.createHash('sha256').update(normalizedSuggestion).digest('hex').slice(0, 16)
      : null
    // Always include hash in body when available (for idempotency), reviewId is optional
    const idempotencySection = suggestionHash
      ? (reviewId 
          ? `- **Process Review ID**: ${reviewId}
- **Suggestion Hash**: ${suggestionHash}`
          : `- **Suggestion Hash**: ${suggestionHash}`)
      : ''
    
    const { title, bodyMd } = generateTicketBody(
      sourceRef,
      isSingleSuggestion && !!actualSuggestion,
      isSingleSuggestion ? normalizedSuggestion : suggestionText,
      idempotencySection
    )

    // Try to create ticket with retries for ID collisions
    const MAX_RETRIES = 10
    let lastInsertError: { code?: string; message?: string } | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidateNum = startNum + attempt
      const displayId = `${prefix}-${String(candidateNum).padStart(4, '0')}`
      const id = String(candidateNum)
      const filename = `${String(candidateNum).padStart(4, '0')}-${slugFromTitle(title)}.md`
      const now = new Date().toISOString()

      try {
        // Try new schema first (repo-scoped)
        const insert = await supabase.from('tickets').insert({
          pk: crypto.randomUUID(),
          repo_full_name: repoFullName,
          ticket_number: candidateNum,
          display_id: displayId,
          id,
          filename,
          title: `${displayId} — ${title}`,
          body_md: bodyMd,
          kanban_column_id: 'col-unassigned',
          kanban_position: 0,
          kanban_moved_at: now,
        })

        const insertData = insert.data as Array<{ pk: string }> | null
        if (!insert.error && insertData && insertData.length > 0) {
          const insertedTicket = insertData[0]
          json(res, 200, {
            success: true,
            ticketId: displayId,
            id,
            pk: insertedTicket.pk,
          })
          return
        }

        // Check if it's a unique violation (we can retry)
        if (!isUniqueViolation(insert.error)) {
          json(res, 200, {
            success: false,
            error: `Failed to create ticket: ${insert.error.message}`,
          })
          return
        }

        lastInsertError = insert.error
      } catch (err) {
        lastInsertError = err as { code?: string; message?: string }
      }
    }

    json(res, 200, {
      success: false,
      error: `Could not create ticket after ${MAX_RETRIES} attempts (ID collision). Last error: ${lastInsertError?.message || 'unknown'}`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

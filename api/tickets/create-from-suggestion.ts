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
} from './_shared.js'

interface RequestBody {
  sourceTicketId?: string
  sourceTicketPk?: string
  suggestion?: string
  justification?: string
  reviewId?: string
  suggestionIndex?: number
  supabaseUrl?: string
  supabaseAnonKey?: string
}

interface SourceTicket {
  pk: string
  id: string
  display_id?: string
  repo_full_name?: string
}

/**
 * Checks for existing ticket with same reviewId and suggestionIndex (idempotency).
 * Returns existing ticket data if found, null otherwise.
 */
async function checkIdempotency(
  supabase: any,
  reviewId: string,
  suggestionIndex: number
): Promise<{ pk: string; id: string; display_id?: string } | null> {
  const { data: existingTickets } = await supabase
    .from('tickets')
    .select('pk, id, display_id')
    .like('body_md', `%review_id: ${reviewId}%`)
    .like('body_md', `%suggestion_index: ${suggestionIndex}%`)
    .limit(1)

  if (existingTickets && existingTickets.length > 0) {
    return existingTickets[0]
  }
  return null
}

/**
 * Determines the next ticket number for a repository.
 * Queries existing tickets and returns max + 1, or 1 if none exist.
 */
async function determineNextTicketNumber(
  supabase: any,
  repoFullName: string
): Promise<number> {
  try {
    const { data: existingRows, error: fetchError } = await supabase
      .from('tickets')
      .select('ticket_number')
      .eq('repo_full_name', repoFullName)
      .order('ticket_number', { ascending: false })
      .limit(1)

    if (!fetchError && existingRows && existingRows.length > 0) {
      const maxNum = (existingRows[0] as { ticket_number?: number }).ticket_number ?? 0
      return maxNum + 1
    }
  } catch {
    // Fallback to 1 if query fails
  }
  return 1
}

/**
 * Generates ticket body markdown from suggestion and metadata.
 */
function generateTicketBody(
  suggestion: string,
  sourceRef: string,
  reviewId?: string,
  suggestionIndex?: number,
  justification?: string
): string {
  const linkageSection = reviewId
    ? `\n- **Review ID**: ${reviewId}${suggestionIndex !== undefined ? `\n- **Suggestion Index**: ${suggestionIndex}` : ''}`
    : ''

  return `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review${linkageSection}

## Goal (one sentence)

${suggestion}

## Human-verifiable deliverable (UI-only)

Updated agent rules, templates, or process documentation that addresses the suggestion above.

## Acceptance criteria (UI-only)

- [ ] Agent instructions/rules updated to address the suggestion
- [ ] Changes are documented and tested
- [ ] Process improvements are reflected in relevant documentation

## Constraints

- Keep changes focused on agent instructions and process, not implementation code
- Ensure changes are backward compatible where possible

## Non-goals

- Implementation code changes
- Feature additions unrelated to process improvement

## Suggestion details

${suggestion}

${justification ? `\n**Justification**: ${justification}` : ''}

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestion for ticket ${sourceRef}. Review the suggestion above and implement the appropriate improvements to agent instructions, rules, or process documentation.
`
}

interface CreateTicketResult {
  success: true
  ticketId: string
  id: string
  pk: string
}

interface CreateTicketError {
  success: false
  error: string
  retryable: boolean
}

type CreateTicketResponse = CreateTicketResult | CreateTicketError

/**
 * Attempts to create a ticket with retry logic for ID collisions.
 * Returns success data or error information.
 */
async function createTicketWithRetry(
  supabase: any,
  repoFullName: string,
  prefix: string,
  startNum: number,
  title: string,
  bodyMd: string
): Promise<CreateTicketResponse> {
  const MAX_RETRIES = 10
  let lastInsertError: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidateNum = startNum + attempt
    const displayId = `${prefix}-${String(candidateNum).padStart(4, '0')}`
    const id = String(candidateNum)
    const filename = `${String(candidateNum).padStart(4, '0')}-${slugFromTitle(title)}.md`
    const now = new Date().toISOString()
    const ticketPk = crypto.randomUUID()

    try {
      const insert = await supabase.from('tickets').insert({
        pk: ticketPk,
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

      if (!insert.error) {
        return {
          success: true,
          ticketId: displayId,
          id,
          pk: ticketPk,
        }
      }

      // Check if it's a unique violation (we can retry)
      if (!isUniqueViolation(insert.error)) {
        return {
          success: false,
          error: `Failed to create ticket: ${insert.error.message}`,
          retryable: false,
        }
      }

      lastInsertError = insert.error
    } catch (err) {
      lastInsertError = err as { code?: string; message?: string }
    }
  }

  return {
    success: false,
    error: `Could not create ticket after ${MAX_RETRIES} attempts (ID collision). Last error: ${lastInsertError?.message || 'unknown'}`,
    retryable: true,
  }
}

/**
 * Fetches source ticket by PK or ID.
 */
async function fetchSourceTicket(
  supabase: any,
  sourceTicketPk?: string,
  sourceTicketId?: string
): Promise<SourceTicket | null> {
  const sourceTicketQuery = sourceTicketPk
    ? await supabase
        .from('tickets')
        .select('pk, id, display_id, title, repo_full_name')
        .eq('pk', sourceTicketPk)
        .maybeSingle()
    : await supabase
        .from('tickets')
        .select('pk, id, display_id, title, repo_full_name')
        .eq('id', sourceTicketId!)
        .maybeSingle()

  if (sourceTicketQuery.error || !sourceTicketQuery.data) {
    return null
  }

  return sourceTicketQuery.data
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
    const body = (await readJsonBody(req)) as RequestBody

    const sourceTicketPk = typeof body.sourceTicketPk === 'string' ? body.sourceTicketPk.trim() : undefined
    const sourceTicketId = typeof body.sourceTicketId === 'string' ? body.sourceTicketId.trim() : undefined
    const suggestion = typeof body.suggestion === 'string' ? body.suggestion.trim() : undefined
    const justification = typeof body.justification === 'string' ? body.justification.trim() : undefined
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : undefined
    const suggestionIndex = typeof body.suggestionIndex === 'number' ? body.suggestionIndex : undefined

    // Parse Supabase credentials
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    // Validate required fields
    if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'sourceTicketPk (preferred) or sourceTicketId, and Supabase credentials are required.',
      })
      return
    }

    if (!suggestion || suggestion.length === 0) {
      json(res, 400, {
        success: false,
        error: 'suggestion is required and must be non-empty.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch source ticket
    const sourceTicket = await fetchSourceTicket(supabase, sourceTicketPk, sourceTicketId)
    if (!sourceTicket) {
      json(res, 200, {
        success: false,
        error: 'Source ticket not found',
      })
      return
    }

    const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
    const prefix = repoHintPrefix(repoFullName)

    // Check idempotency if reviewId and suggestionIndex provided
    if (reviewId !== undefined && suggestionIndex !== undefined) {
      const existingTicket = await checkIdempotency(supabase, reviewId, suggestionIndex)
      if (existingTicket) {
        json(res, 200, {
          success: true,
          ticketId: existingTicket.display_id || existingTicket.id,
          id: existingTicket.id,
          pk: existingTicket.pk,
          skipped: true,
          reason: 'Ticket already exists for this suggestion',
        })
        return
      }
    }

    // Determine next ticket number
    const startNum = await determineNextTicketNumber(supabase, repoFullName)

    // Generate ticket content
    const sourceRef = sourceTicket.display_id || sourceTicket.id
    const title = suggestion.length > 80 ? `${suggestion.slice(0, 77)}...` : suggestion
    const bodyMd = generateTicketBody(suggestion, sourceRef, reviewId, suggestionIndex, justification)

    // Create ticket with retry logic
    const result = await createTicketWithRetry(supabase, repoFullName, prefix, startNum, title, bodyMd)

    if (result.success) {
      json(res, 200, {
        success: true,
        ticketId: result.ticketId,
        id: result.id,
        pk: result.pk,
      })
      return
    }

    // Return error from createTicketWithRetry
    json(res, 200, {
      success: false,
      error: result.error,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

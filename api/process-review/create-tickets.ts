import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Utility functions - exported for testing
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

export function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen. */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

export function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) return t.toUpperCase()
  }

  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters.slice(0, 4) || 'PRJ').toUpperCase()
}

export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

/** Generate a deterministic hash for a suggestion to enable idempotency checks. */
export function hashSuggestion(reviewId: string, suggestionText: string): string {
  const combined = `${reviewId}:${suggestionText}`
  const hash = crypto.createHash('sha256').update(combined).digest('hex')
  // Use first 16 chars for readability (still very unlikely to collide)
  return hash.substring(0, 16)
}

// Extracted helper functions to reduce complexity

interface SupabaseCredentials {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

function parseSupabaseCredentials(body: {
  supabaseUrl?: unknown
  supabaseAnonKey?: unknown
}): SupabaseCredentials {
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
  return { supabaseUrl, supabaseAnonKey }
}

function extractExistingHashes(tickets: Array<{ body_md?: string | null }>): Set<string> {
  const existingHashes = new Set<string>()
  for (const ticket of tickets) {
    const bodyMd = ticket.body_md || ''
    const hashMatch = bodyMd.match(/<!-- review-hash: ([a-z0-9]+) -->/)
    if (hashMatch) {
      existingHashes.add(hashMatch[1])
    }
  }
  return existingHashes
}

async function getNextTicketNumber(
  supabase: ReturnType<typeof createClient>,
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

function generateTicketBody(
  sourceRef: string,
  reviewId: string,
  suggestionHash: string,
  suggestionText: string,
  justification?: string
): string {
  return `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review
- **Review ID**: ${reviewId}
<!-- review-hash: ${suggestionHash} -->

## Goal (one sentence)

${suggestionText}

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

## Justification

${justification || 'No justification provided.'}

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestion for ticket ${sourceRef}. Review the suggestion above and implement the appropriate improvements to agent instructions, rules, or process documentation.
`
}

interface TicketCreationResult {
  ticketId: string
  id: string
  pk: string
}

async function createTicketWithRetry(
  supabase: ReturnType<typeof createClient>,
  repoFullName: string,
  prefix: string,
  title: string,
  bodyMd: string,
  startNum: number,
  MAX_RETRIES: number
): Promise<{ success: true; result: TicketCreationResult; nextNum: number } | { success: false; error: string }> {
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
          result: {
            ticketId: displayId,
            id,
            pk: ticketPk,
          },
          nextNum: candidateNum + 1,
        }
      }

      // Check if it's a unique violation (we can retry)
      if (!isUniqueViolation(insert.error)) {
        lastInsertError = insert.error
        break
      }

      lastInsertError = insert.error
    } catch (err) {
      lastInsertError = err as { code?: string; message?: string }
    }
  }

  return {
    success: false,
    error: `Could not create ticket after ${MAX_RETRIES} attempts. ${lastInsertError?.message || 'Unknown error'}`,
  }
}

interface RequestBody {
  reviewId?: string
  sourceTicketId?: string
  sourceTicketPk?: string
  suggestions?: Array<{ text: string; justification: string }>
  supabaseUrl?: string
  supabaseAnonKey?: string
}

interface ParsedRequest {
  reviewId: string
  sourceTicketPk?: string
  sourceTicketId?: string
  suggestions: Array<{ text: string; justification: string }>
  supabaseUrl: string
  supabaseAnonKey: string
}

function parseRequestBody(body: unknown): ParsedRequest | { error: string } {
  const b = body as RequestBody
  const reviewId = typeof b.reviewId === 'string' ? b.reviewId.trim() : undefined
  const sourceTicketPk = typeof b.sourceTicketPk === 'string' ? b.sourceTicketPk.trim() : undefined
  const sourceTicketId = typeof b.sourceTicketId === 'string' ? b.sourceTicketId.trim() : undefined
  const suggestions = Array.isArray(b.suggestions)
    ? b.suggestions.filter((s) => s && typeof s.text === 'string' && s.text.trim())
    : []

  const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(b)

  if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
    return { error: 'sourceTicketPk (preferred) or sourceTicketId, reviewId, and Supabase credentials are required.' }
  }

  if (!reviewId) {
    return { error: 'reviewId is required for idempotency checks.' }
  }

  return { reviewId, sourceTicketPk, sourceTicketId, suggestions, supabaseUrl, supabaseAnonKey }
}

interface SourceTicketInfo {
  repoFullName: string
  prefix: string
  sourceRef: string
}

async function fetchSourceTicketInfo(
  supabase: ReturnType<typeof createClient>,
  sourceTicketPk?: string,
  sourceTicketId?: string
): Promise<SourceTicketInfo | { error: string }> {
  const sourceTicketQuery = sourceTicketPk
    ? await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('pk', sourceTicketPk).maybeSingle()
    : await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('id', sourceTicketId!).maybeSingle()

  if (sourceTicketQuery.error || !sourceTicketQuery.data) {
    return { error: `Source ticket not found: ${sourceTicketQuery.error?.message || 'Unknown error'}` }
  }

  const sourceTicket = sourceTicketQuery.data
  const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
  const prefix = repoHintPrefix(repoFullName)
  const sourceRef = sourceTicket.display_id || sourceTicket.id

  return { repoFullName, prefix, sourceRef }
}

interface ProcessSuggestionResult {
  created: Array<{ ticketId: string; id: string; pk: string }>
  skipped: Array<{ suggestion: string; reason: string }>
  errors: Array<{ suggestion: string; error: string }>
}

async function processSuggestions(
  supabase: ReturnType<typeof createClient>,
  reviewId: string,
  suggestions: Array<{ text: string; justification: string }>,
  repoFullName: string,
  prefix: string,
  sourceRef: string,
  existingHashes: Set<string>,
  startNum: number
): Promise<ProcessSuggestionResult> {
  const created: Array<{ ticketId: string; id: string; pk: string }> = []
  const skipped: Array<{ suggestion: string; reason: string }> = []
  const errors: Array<{ suggestion: string; error: string }> = []
  let currentTicketNum = startNum
  const MAX_RETRIES = 10

  for (const suggestion of suggestions) {
    const suggestionText = suggestion.text.trim()
    const suggestionHash = hashSuggestion(reviewId, suggestionText)

    // Check if this suggestion was already processed (idempotency)
    if (existingHashes.has(suggestionHash)) {
      skipped.push({
        suggestion: suggestionText,
        reason: 'Ticket already exists for this suggestion (idempotency check)',
      })
      continue
    }

    // Generate ticket content from single suggestion
    const title = `Improve agent instructions: ${suggestionText.slice(0, 60)}${suggestionText.length > 60 ? '...' : ''}`
    const bodyMd = generateTicketBody(sourceRef, reviewId, suggestionHash, suggestionText, suggestion.justification)

    // Try to create ticket with retries for ID collisions
    const result = await createTicketWithRetry(supabase, repoFullName, prefix, title, bodyMd, currentTicketNum, MAX_RETRIES)

    if (result.success) {
      created.push(result.result)
      currentTicketNum = result.nextNum
    } else {
      errors.push({
        suggestion: suggestionText,
        error: result.error,
      })
    }
  }

  return { created, skipped, errors }
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res)

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
    // Deprecated (2026-02): This endpoint created tickets automatically from Process Review suggestions.
    // The intended flow is now:
    // 1) run Process Review to generate suggestions
    // 2) show suggestions in a UI modal
    // 3) only create tickets after the user explicitly clicks "Implement"
    //
    // Ticket creation should happen via `/api/tickets/create` (single-suggestion mode) from the Implement action.
    json(res, 410, {
      success: false,
      error:
        'Deprecated: /api/process-review/create-tickets has been removed. Create Process Review tickets only via explicit UI "Implement" using /api/tickets/create.',
    })
    return

    const body = await readJsonBody(req)
    const parsed = parseRequestBody(body)

    if ('error' in parsed) {
      json(res, 400, { success: false, error: parsed.error })
      return
    }

    if (parsed.suggestions.length === 0) {
      json(res, 200, {
        success: true,
        created: [],
        skipped: [],
        errors: [],
        message: 'No suggestions to create tickets for.',
      })
      return
    }

    const supabase = createClient(parsed.supabaseUrl, parsed.supabaseAnonKey)

    const sourceInfo = await fetchSourceTicketInfo(supabase, parsed.sourceTicketPk, parsed.sourceTicketId)
    if ('error' in sourceInfo) {
      json(res, 200, { success: false, error: sourceInfo.error })
      return
    }

    // Check for existing tickets created from this review (idempotency check)
    const existingTicketsQuery = await supabase
      .from('tickets')
      .select('pk, id, title, body_md')
      .eq('repo_full_name', sourceInfo.repoFullName)
      .like('title', `%${sourceInfo.sourceRef} Process Review%`)
      .order('ticket_number', { ascending: false })

    const existingTickets = existingTicketsQuery.data || []
    const existingHashes = extractExistingHashes(existingTickets)

    // Determine next ticket number (repo-scoped)
    const startNum = await getNextTicketNumber(supabase, sourceInfo.repoFullName)

    const { created, skipped, errors } = await processSuggestions(
      supabase,
      parsed.reviewId,
      parsed.suggestions,
      sourceInfo.repoFullName,
      sourceInfo.prefix,
      sourceInfo.sourceRef,
      existingHashes,
      startNum
    )

    // If any errors occurred, return partial success with error details
    if (errors.length > 0) {
      json(res, 200, {
        success: false,
        created,
        skipped,
        errors,
        message: `Created ${created.length} ticket(s), skipped ${skipped.length}, ${errors.length} error(s).`,
      })
      return
    }

    json(res, 200, {
      success: true,
      created,
      skipped,
      errors: [],
      message: `Successfully created ${created.length} ticket(s)${skipped.length > 0 ? `, skipped ${skipped.length} duplicate(s)` : ''}.`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

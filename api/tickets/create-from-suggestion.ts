import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

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

interface ParsedRequest {
  sourceTicketPk?: string
  sourceTicketId?: string
  suggestion: string
  justification?: string
  reviewId?: string
  suggestionIndex?: number
  supabaseUrl: string
  supabaseAnonKey: string
}

function parseRequestBody(body: unknown): ParsedRequest | null {
  const b = body as RequestBody
  const sourceTicketPk = typeof b.sourceTicketPk === 'string' ? b.sourceTicketPk.trim() : undefined
  const sourceTicketId = typeof b.sourceTicketId === 'string' ? b.sourceTicketId.trim() : undefined
  const suggestion = typeof b.suggestion === 'string' ? b.suggestion.trim() : undefined
  const justification = typeof b.justification === 'string' ? b.justification.trim() : undefined
  const reviewId = typeof b.reviewId === 'string' ? b.reviewId.trim() : undefined
  const suggestionIndex = typeof b.suggestionIndex === 'number' ? b.suggestionIndex : undefined

  const supabaseUrl =
    (typeof b.supabaseUrl === 'string' ? b.supabaseUrl.trim() : undefined) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    (typeof b.supabaseAnonKey === 'string' ? b.supabaseAnonKey.trim() : undefined) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined

  if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!suggestion || suggestion.length === 0) {
    return null
  }

  return {
    sourceTicketPk,
    sourceTicketId,
    suggestion,
    justification,
    reviewId,
    suggestionIndex,
    supabaseUrl,
    supabaseAnonKey,
  }
}

async function fetchSourceTicket(
  supabase: ReturnType<typeof createClient>,
  sourceTicketPk?: string,
  sourceTicketId?: string
) {
  const query = sourceTicketPk
    ? await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('pk', sourceTicketPk).maybeSingle()
    : await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('id', sourceTicketId!).maybeSingle()

  if (query.error || !query.data) {
    return null
  }

  return query.data
}

async function checkExistingTicket(
  supabase: ReturnType<typeof createClient>,
  reviewId: string | undefined,
  suggestionIndex: number | undefined
) {
  if (reviewId === undefined || suggestionIndex === undefined) {
    return null
  }

  const { data: existingTickets } = await supabase
    .from('tickets')
    .select('pk, id, display_id')
    .like('body_md', `%review_id: ${reviewId}%`)
    .like('body_md', `%suggestion_index: ${suggestionIndex}%`)
    .limit(1)

  return existingTickets && existingTickets.length > 0 ? existingTickets[0] : null
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
  suggestion: string,
  justification: string | undefined,
  reviewId: string | undefined,
  suggestionIndex: number | undefined
): string {
  const linkageSection = reviewId
    ? `\n- **Review ID**: ${reviewId}${suggestionIndex !== undefined ? `\n- **Suggestion Index**: ${suggestionIndex}` : ''}`
    : ''
  const justificationSection = justification ? `\n\n**Justification**: ${justification}` : ''

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

${suggestion}${justificationSection}

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestion for ticket ${sourceRef}. Review the suggestion above and implement the appropriate improvements to agent instructions, rules, or process documentation.
`
}

async function createTicketWithRetry(
  supabase: ReturnType<typeof createClient>,
  repoFullName: string,
  prefix: string,
  startNum: number,
  title: string,
  bodyMd: string
): Promise<{ success: true; ticketId: string; id: string; pk: string } | { success: false; error: string }> {
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
        return { success: true, ticketId: displayId, id, pk: ticketPk }
      }

      if (!isUniqueViolation(insert.error)) {
        return { success: false, error: `Failed to create ticket: ${insert.error.message}` }
      }

      lastInsertError = insert.error
    } catch (err) {
      lastInsertError = err as { code?: string; message?: string }
    }
  }

  return {
    success: false,
    error: `Could not create ticket after ${MAX_RETRIES} attempts (ID collision). Last error: ${lastInsertError?.message || 'unknown'}`,
  }
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
    const body = await readJsonBody(req)
    const parsed = parseRequestBody(body)

    if (!parsed) {
      json(res, 400, {
        success: false,
        error: 'sourceTicketPk (preferred) or sourceTicketId, Supabase credentials, and non-empty suggestion are required.',
      })
      return
    }

    const supabase = createClient(parsed.supabaseUrl, parsed.supabaseAnonKey)

    const sourceTicket = await fetchSourceTicket(supabase, parsed.sourceTicketPk, parsed.sourceTicketId)
    if (!sourceTicket) {
      json(res, 200, {
        success: false,
        error: 'Source ticket not found',
      })
      return
    }

    const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
    const prefix = repoHintPrefix(repoFullName)

    const existingTicket = await checkExistingTicket(supabase, parsed.reviewId, parsed.suggestionIndex)
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

    const startNum = await getNextTicketNumber(supabase, repoFullName)
    const sourceRef = sourceTicket.display_id || sourceTicket.id
    const title = parsed.suggestion.length > 80 ? `${parsed.suggestion.slice(0, 77)}...` : parsed.suggestion
    const bodyMd = generateTicketBody(sourceRef, parsed.suggestion, parsed.justification, parsed.reviewId, parsed.suggestionIndex)

    const result = await createTicketWithRetry(supabase, repoFullName, prefix, startNum, title, bodyMd)

    if (result.success) {
      json(res, 200, {
        success: true,
        ticketId: result.ticketId,
        id: result.id,
        pk: result.pk,
      })
    } else {
      json(res, 200, {
        success: false,
        error: result.error,
      })
    }
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

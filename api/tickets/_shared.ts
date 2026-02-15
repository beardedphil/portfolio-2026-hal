/**
 * Shared utilities for ticket/kanban endpoints.
 * Extracted from create.ts and move.ts to reduce duplication and keep files under 250 lines.
 */

import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Reads and parses JSON body from an HTTP request.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/**
 * Sends a JSON response with the specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen.
 */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

/**
 * Generates a repository hint prefix from a repo full name.
 * Examples:
 *   "beardedphil/portfolio-2026-hal" -> "HAL"
 *   "user/my-project" -> "PROJ"
 */
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

/**
 * Checks if an error is a unique constraint violation (PostgreSQL error code 23505).
 */
export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

/**
 * Parses Supabase credentials from request body or environment variables.
 */
export function parseSupabaseCredentials(body: {
  supabaseUrl?: string
  supabaseAnonKey?: string
}): { supabaseUrl?: string; supabaseAnonKey?: string } {
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

/**
 * Fetches a ticket by PK or ID using multiple lookup strategies.
 * Handles different ticket ID formats: numeric id, display_id, etc.
 */
export async function fetchTicketByPkOrId(
  supabase: any,
  ticketPk?: string,
  ticketId?: string
): Promise<{ data: any; error: any } | null> {
  if (ticketPk) {
    return await supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')
      .eq('pk', ticketPk)
      .maybeSingle()
  }

  if (!ticketId) return null

  // Strategy 1: Try by id field as-is (e.g., "172")
  let ticketFetch = await supabase
    .from('tickets')
    .select('pk, repo_full_name, kanban_column_id, kanban_position')
    .eq('id', ticketId)
    .maybeSingle()

  // Strategy 2: If not found, try by display_id (e.g., "HAL-0172")
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data)) {
    ticketFetch = await supabase
      .from('tickets')
      .select('pk, repo_full_name, kanban_column_id, kanban_position')
      .eq('display_id', ticketId)
      .maybeSingle()
  }

  // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
    const numericPart = ticketId.replace(/^[A-Z]+-/, '')
    // Remove leading zeros to get the actual id value (e.g., "0172" -> "172")
    const idValue = numericPart.replace(/^0+/, '') || numericPart
    if (idValue !== ticketId) {
      ticketFetch = await supabase
        .from('tickets')
        .select('pk, repo_full_name, kanban_column_id, kanban_position')
        .eq('id', idValue)
        .maybeSingle()
    }
  }

  // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
  if (ticketFetch && (ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
    const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
    if (withoutLeadingZeros !== ticketId) {
      ticketFetch = await supabase
        .from('tickets')
        .select('pk, repo_full_name, kanban_column_id, kanban_position')
        .eq('id', withoutLeadingZeros)
        .maybeSingle()
    }
  }

  return ticketFetch
}

/**
 * Generates ticket body markdown for process review suggestions.
 */
export function generateTicketBody(
  sourceRef: string,
  isSingleSuggestion: boolean,
  suggestionText: string,
  idempotencySection: string
): { title: string; bodyMd: string } {
  if (isSingleSuggestion) {
    const title = suggestionText.length > 100 ? `${suggestionText.slice(0, 97)}...` : suggestionText
    const bodyMd = `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review
${idempotencySection ? `\n${idempotencySection}` : ''}

## Goal (one sentence)

${suggestionText}

## Human-verifiable deliverable (UI-only)

Updated agent instructions, rules, templates, or process documentation that implements the improvement described in the Goal above.

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

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestion for ticket ${sourceRef}. Review the Goal above and implement the appropriate improvement to agent instructions, rules, or process documentation.
`
    return { title, bodyMd }
  } else {
    const title = `Improve agent instructions based on ${sourceRef} Process Review`
    const bodyMd = `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review
${idempotencySection ? `\n${idempotencySection}` : ''}

## Goal (one sentence)

Improve agent instructions and process documentation based on review of ticket ${sourceRef} artifacts.

## Human-verifiable deliverable (UI-only)

Updated agent rules, templates, or process documentation that addresses the suggested improvements below.

## Acceptance criteria (UI-only)

- [ ] Agent instructions/rules updated to address the suggestions
- [ ] Changes are documented and tested
- [ ] Process improvements are reflected in relevant documentation

## Constraints

- Keep changes focused on agent instructions and process, not implementation code
- Ensure changes are backward compatible where possible

## Non-goals

- Implementation code changes
- Feature additions unrelated to process improvement

## Suggested improvements

${suggestionText}

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestions for ticket ${sourceRef}. Review the suggestions above and implement the appropriate improvements to agent instructions, rules, or process documentation.
`
    return { title, bodyMd }
  }
}

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { slugFromTitle, isUniqueViolation } from './_shared.js'
import { computeSuggestionHash, buildHashPattern, buildSourcePattern } from './_processReviewIdempotency.js'

// Type alias for Supabase client to avoid type inference issues in build environments
// Using 'any' to work around TypeScript type inference issues with SupabaseClient generics
type SupabaseClientType = any

export function generateSingleSuggestionBody(sourceRef: string, suggestion: string, idempotencySection: string): string {
  return `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review
${idempotencySection ? `\n${idempotencySection}` : ''}

## Goal (one sentence)

${suggestion}

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
}

export function generateMultipleSuggestionsBody(sourceRef: string, suggestionText: string, idempotencySection: string): string {
  return `# Ticket

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
}

export async function checkIdempotency(
  supabase: SupabaseClientType,
  singleSuggestion: string | undefined,
  repoFullName: string,
  sourceRef: string
): Promise<{ pk: string; id: string; display_id: string } | null> {
  if (!singleSuggestion) return null

  const normalizedSuggestion = singleSuggestion.trim()
  const suggestionHash = computeSuggestionHash(normalizedSuggestion)
  const hashPattern = buildHashPattern(suggestionHash)
  const sourcePattern = buildSourcePattern(sourceRef)

  const { data: existingTickets } = await supabase
    .from('tickets')
    .select('pk, id, display_id')
    .eq('repo_full_name', repoFullName)
    .like('body_md', `%${sourcePattern}%`)
    .like('body_md', `%${hashPattern}%`)
    .limit(1)

  return existingTickets && existingTickets.length > 0 ? existingTickets[0] : null
}

export async function getNextTicketNumber(
  supabase: SupabaseClientType,
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

export async function createTicketWithRetry(
  supabase: SupabaseClientType,
  startNum: number,
  prefix: string,
  title: string,
  bodyMd: string,
  repoFullName: string
): Promise<{ pk: string; id: string; displayId: string } | null> {
  const MAX_RETRIES = 10
  let lastInsertError: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidateNum = startNum + attempt
    const displayId = `${prefix}-${String(candidateNum).padStart(4, '0')}`
    const id = String(candidateNum)
    const filename = `${String(candidateNum).padStart(4, '0')}-${slugFromTitle(title)}.md`
    const now = new Date().toISOString()

    try {
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
      } as any)

      const insertData = insert.data as Array<{ pk: string }> | null
      if (!insert.error && insertData && insertData.length > 0) {
        return { pk: insertData[0].pk, id, displayId }
      }

      if (!isUniqueViolation(insert.error)) {
        lastInsertError = insert.error
        return null
      }

      lastInsertError = insert.error
    } catch (err) {
      lastInsertError = err as { code?: string; message?: string }
    }
  }

  return null
}

import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

/** Type accepted by shared escalation helpers (avoids strict client generics mismatch across call sites). */
type SupabaseClientLike = SupabaseClient

/**
 * Count QA failures by parsing QA artifacts for "QA RESULT: FAIL" entries.
 * Returns the count of FAIL outcomes.
 */
export async function countQaFailures(
  supabase: SupabaseClientLike,
  ticketPk: string
): Promise<number> {
  const { data: artifacts, error } = await supabase
    .from('agent_artifacts')
    .select('body_md, created_at, title')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', 'qa')
    .order('created_at', { ascending: true })

  if (error || !artifacts) {
    return 0
  }

  // Filter to QA report artifacts (artifact_type is derived from title)
  const qaReportArtifacts = artifacts.filter((artifact) => {
    const title = (artifact.title || '').toLowerCase().trim()
    return title.startsWith('qa report for ticket')
  })

  let failCount = 0
  const qaResultRegex = /QA RESULT:\s*(FAIL|PASS)\s*—\s*([A-Z0-9-]+)/gi

  for (const artifact of qaReportArtifacts) {
    const bodyMd = artifact.body_md || ''
    // Check for FAIL outcomes in the artifact body
    // Count each FAIL occurrence (artifacts can have multiple updates)
    const matches = Array.from(bodyMd.matchAll(qaResultRegex))
    for (const match of matches) {
      if (match[1]?.toUpperCase() === 'FAIL') {
        failCount++
      }
    }
  }

  return failCount
}

/**
 * Count HITL failures by parsing QA artifacts created from HITL validation failures.
 * HITL failures are identified by checking if the artifact was created when the ticket
 * was in the Human in the Loop column, or by checking for "Human validation failure" text.
 */
export async function countHitlFailures(
  supabase: SupabaseClientLike,
  ticketPk: string
): Promise<number> {
  const { data: artifacts, error } = await supabase
    .from('agent_artifacts')
    .select('body_md, created_at, title')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', 'qa')
    .order('created_at', { ascending: true })

  if (error || !artifacts) {
    return 0
  }

  // Filter to QA report artifacts (artifact_type is derived from title)
  const qaReportArtifacts = artifacts.filter((artifact) => {
    const title = (artifact.title || '').toLowerCase().trim()
    return title.startsWith('qa report for ticket')
  })

  let failCount = 0
  const qaResultRegex = /QA RESULT:\s*(FAIL|PASS)\s*—\s*([A-Z0-9-]+)/gi
  const hitlFailureIndicator = /Human validation failure|Human in the Loop phase/i

  for (const artifact of qaReportArtifacts) {
    const bodyMd = artifact.body_md || ''
    // Check if this artifact is from a HITL failure
    const isHitlFailure = hitlFailureIndicator.test(bodyMd)
    
    if (isHitlFailure) {
      // Count FAIL outcomes in HITL artifacts
      const matches = Array.from(bodyMd.matchAll(qaResultRegex))
      for (const match of matches) {
        if (match[1]?.toUpperCase() === 'FAIL') {
          failCount++
        }
      }
    }
  }

  return failCount
}

/**
 * Create a suggestion ticket for a failed ticket.
 * The suggestion focuses on process improvements to reduce repeat failures.
 */
export async function createSuggestionTicket(
  supabase: SupabaseClientLike,
  sourceTicket: { pk: string; display_id: string; id: string; title: string; repo_full_name: string },
  failureType: 'qa' | 'hitl',
  failureCount: number
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
  const sourceRef = sourceTicket.display_id || sourceTicket.id

  // Determine next ticket number
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

  // Generate repo prefix
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
  let prefix = 'PRJ'
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) {
      prefix = t.toUpperCase()
      break
    }
  }

  const ticketNum = startNum
  const displayId = `${prefix}-${String(ticketNum).padStart(4, '0')}`
  const id = String(ticketNum)

  // Generate suggestion text based on failure type
  const failureTypeLabel = failureType === 'qa' ? 'QA' : 'Human in the Loop'
  const suggestionText = failureType === 'qa'
    ? `Improve agent instructions or process documentation to reduce QA failures for tickets like ${sourceRef}. This ticket has failed QA ${failureCount} times, indicating a systemic issue that requires process improvement.`
    : `Improve agent instructions or process documentation to reduce Human-in-the-Loop validation failures for tickets like ${sourceRef}. This ticket has failed human validation ${failureCount} times, indicating a gap between implementation and user expectations.`

  const title = `Process improvement: Reduce ${failureTypeLabel} failures (from ${sourceRef})`
  
  // Slug for filename
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
  const filename = `${String(ticketNum).padStart(4, '0')}-${slug}.md`

  const bodyMd = `# Ticket

- **ID**: ${displayId}
- **Title**: ${title}
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Auto-escalation (${failureTypeLabel} failure #${failureCount})
- **Failure type**: ${failureTypeLabel}
- **Failure count**: ${failureCount}

## Goal (one sentence)

${suggestionText}

## Human-verifiable deliverable (UI-only)

Updated agent rules, templates, or process documentation that addresses the root cause of repeated ${failureTypeLabel} failures, reducing the likelihood of similar tickets failing ${failureTypeLabel} validation.

## Acceptance criteria (UI-only)

- [ ] Root cause analysis identifies why ticket ${sourceRef} failed ${failureTypeLabel} ${failureCount} times
- [ ] Agent instructions/rules updated to address the identified root cause
- [ ] Changes are documented and tested
- [ ] Process improvements are reflected in relevant documentation
- [ ] Similar tickets are less likely to fail ${failureTypeLabel} validation after these improvements

## Constraints

- Keep changes focused on agent instructions and process, not implementation code
- Ensure changes are backward compatible where possible
- Focus on actionable improvements that address the specific failure pattern

## Non-goals

- Implementation code changes
- Feature additions unrelated to process improvement
- Changes that don't address the root cause of repeated failures

## Implementation notes (optional)

This ticket was automatically created when ticket ${sourceRef} failed ${failureTypeLabel} for the ${failureCount}${failureCount === 3 ? 'rd' : failureCount === 2 ? 'nd' : 'th'} time and was escalated to Process Review. Review the failure history in ticket ${sourceRef}'s QA artifacts to identify the root cause and implement appropriate process improvements.
`

  const now = new Date().toISOString()
  const ticketPk = crypto.randomUUID()

  try {
    const { error: insertError } = await supabase.from('tickets').insert({
      pk: ticketPk,
      repo_full_name: repoFullName,
      ticket_number: ticketNum,
      display_id: displayId,
      id,
      filename,
      title: `${displayId} — ${title}`,
      body_md: bodyMd,
      kanban_column_id: 'col-unassigned',
      kanban_position: 0,
      kanban_moved_at: now,
    })

    if (insertError) {
      return {
        success: false,
        error: `Failed to create suggestion ticket: ${insertError.message}`,
      }
    }

    return {
      success: true,
      ticketId: displayId,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Check if a ticket should be escalated to Process Review and perform the escalation if needed.
 * Returns the failure counts and whether escalation occurred.
 */
export async function checkFailureEscalation(
  supabase: SupabaseClientLike,
  ticketPk: string,
  failureType?: 'qa' | 'hitl'
): Promise<{
  qaFailCount: number
  hitlFailCount: number
  escalated: boolean
  suggestionTickets?: string[]
  errors?: string[]
}> {
  // Fetch ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, id, display_id, title, repo_full_name')
    .eq('pk', ticketPk)
    .maybeSingle()

  if (ticketError || !ticket) {
    throw new Error(`Ticket ${ticketPk} not found.`)
  }

  // Count failures
  const qaFailCount = await countQaFailures(supabase, ticketPk)
  const hitlFailCount = await countHitlFailures(supabase, ticketPk)

  // Determine if escalation is needed
  const shouldEscalateQa = qaFailCount >= 3 && failureType !== 'hitl'
  const shouldEscalateHitl = hitlFailCount >= 3 && failureType !== 'qa'

  // If escalation is needed, move ticket to Process Review and create suggestion tickets
  if (shouldEscalateQa || shouldEscalateHitl) {
    // Move ticket to Process Review
    const { error: moveError } = await supabase
      .from('tickets')
      .update({
        kanban_column_id: 'col-process-review',
        kanban_moved_at: new Date().toISOString(),
      })
      .eq('pk', ticketPk)

    if (moveError) {
      throw new Error(`Failed to move ticket to Process Review: ${moveError.message}`)
    }

    // Create at least one suggestion ticket
    const suggestionResults: Array<{ success: boolean; ticketId?: string; error?: string }> = []

    if (shouldEscalateQa) {
      const qaResult = await createSuggestionTicket(supabase, ticket, 'qa', qaFailCount)
      suggestionResults.push(qaResult)
    }

    if (shouldEscalateHitl) {
      const hitlResult = await createSuggestionTicket(supabase, ticket, 'hitl', hitlFailCount)
      suggestionResults.push(hitlResult)
    }

    const created = suggestionResults.filter((r) => r.success)
    const errors = suggestionResults.filter((r) => !r.success)

    return {
      qaFailCount,
      hitlFailCount,
      escalated: true,
      suggestionTickets: created.map((r) => r.ticketId!),
      errors: errors.length > 0 ? errors.map((e) => e.error!).filter(Boolean) : undefined,
    }
  }

  // No escalation needed
  return {
    qaFailCount,
    hitlFailCount,
    escalated: false,
  }
}

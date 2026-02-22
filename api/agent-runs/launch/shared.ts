import type { AgentType, RequestBody, TicketData, ParsedTicketContent } from './types.js'

/** Determine agent type from request body, defaulting to 'implementation'. */
export function determineAgentType(body: RequestBody): AgentType {
  if (body.agentType === 'qa') return 'qa'
  if (body.agentType === 'project-manager') return 'project-manager'
  if (body.agentType === 'process-review') return 'process-review'
  return 'implementation'
}

/** Parse ticket body markdown to extract goal, deliverable, and criteria. */
export function parseTicketContent(bodyMd: string): ParsedTicketContent {
  const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  return {
    goal: (goalMatch?.[1] ?? '').trim(),
    deliverable: (deliverableMatch?.[1] ?? '').trim(),
    criteria: (criteriaMatch?.[1] ?? '').trim(),
  }
}

/** Move QA ticket from QA column to Doing when QA agent starts. */
export async function moveQATicketToDoing(
  supabase: any,
  repoFullName: string,
  ticketPk: string,
  displayId: string
): Promise<void> {
  try {
    const { data: inColumn } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('repo_full_name', repoFullName)
      .eq('kanban_column_id', 'col-doing')
      .order('kanban_position', { ascending: false })
      .limit(1)
    if (inColumn) {
      const nextPosition = inColumn.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
      const movedAt = new Date().toISOString()
      const { error: updateErr } = await supabase
        .from('tickets')
        .update({ kanban_column_id: 'col-doing', kanban_position: nextPosition, kanban_moved_at: movedAt })
        .eq('pk', ticketPk)
      if (updateErr) {
        console.error(`[QA Agent] Failed to move ticket ${displayId} from QA to Doing:`, updateErr.message)
      }
    }
  } catch (moveErr) {
    console.error(`[QA Agent] Error moving ticket ${displayId} from QA to Doing:`, moveErr instanceof Error ? moveErr.message : String(moveErr))
  }
}

/** Find existing PR URL for a ticket. */
export async function findExistingPrUrl(supabase: any, agentType: AgentType, ticketPk: string): Promise<string | null> {
  if (agentType !== 'implementation' || !ticketPk) return null
  const { data: linked } = await supabase
    .from('hal_agent_runs')
    .select('pr_url, created_at')
    .eq('ticket_pk', ticketPk)
    .not('pr_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const prUrl = Array.isArray(linked) && linked.length ? (linked[0] as any)?.pr_url : null
  return typeof prUrl === 'string' && prUrl.trim() ? prUrl.trim() : null
}

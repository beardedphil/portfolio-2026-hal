import type { KanbanAgentRunRow } from 'portfolio-2026-kanban'

/**
 * hal_agent_runs selection logic:
 * A ticket can have multiple runs (implementation + QA + retries). The Kanban "Active Work" badge
 * should reflect the most relevant run for that ticket: prefer any non-terminal run; otherwise the
 * most recent run.
 */
const TERMINAL_RUN_STATUSES = new Set(['finished', 'completed', 'failed'])

export function isNonTerminalRunStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  if (!s) return false
  return !TERMINAL_RUN_STATUSES.has(s)
}

function toTimeMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

export function pickMoreRelevantRun(
  a: KanbanAgentRunRow | undefined,
  b: KanbanAgentRunRow | undefined
): KanbanAgentRunRow | undefined {
  if (!a) return b
  if (!b) return a

  const aActive = isNonTerminalRunStatus((a as any).status)
  const bActive = isNonTerminalRunStatus((b as any).status)
  if (aActive !== bActive) return bActive ? b : a

  const aCreated = toTimeMs((a as any).created_at)
  const bCreated = toTimeMs((b as any).created_at)
  if (aCreated !== bCreated) return bCreated > aCreated ? b : a

  const aUpdated = toTimeMs((a as any).updated_at)
  const bUpdated = toTimeMs((b as any).updated_at)
  if (aUpdated !== bUpdated) return bUpdated > aUpdated ? b : a

  // Stable tie-breaker: keep existing to avoid churn.
  return a
}

export function buildAgentRunsByTicketPk(runRows: KanbanAgentRunRow[]): Record<string, KanbanAgentRunRow> {
  const byPk: Record<string, KanbanAgentRunRow> = {}
  for (const r of runRows) {
    const ticketPk = (r as any).ticket_pk as string | null | undefined
    if (!ticketPk) continue
    const chosen = pickMoreRelevantRun(byPk[ticketPk], r)
    if (chosen) byPk[ticketPk] = chosen
  }
  return byPk
}

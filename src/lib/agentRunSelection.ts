// Pure helper functions for agent run selection logic
// Extracted from src/App.tsx to reduce monolith complexity

import type { KanbanAgentRunRow } from 'portfolio-2026-kanban'

/**
 * Terminal run statuses that indicate a run is complete
 */
export const TERMINAL_RUN_STATUSES = new Set(['finished', 'completed', 'failed'])

/**
 * Check if a run status is non-terminal (i.e., the run is still active)
 * @param status - The run status string (may be null or undefined)
 * @returns True if the status is non-terminal (active), false otherwise
 */
export function isNonTerminalRunStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  if (!s) return false
  return !TERMINAL_RUN_STATUSES.has(s)
}

/**
 * Convert an ISO date string to milliseconds timestamp
 * @param iso - ISO date string (may be null or undefined)
 * @returns Milliseconds timestamp, or 0 if invalid
 */
export function toTimeMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * Pick the more relevant run between two runs for display in Kanban "Active Work" badge.
 * Prefers non-terminal runs over terminal runs. If both are terminal or both are non-terminal,
 * prefers the more recently created/updated run.
 * @param a - First run (may be undefined)
 * @param b - Second run (may be undefined)
 * @returns The more relevant run, or undefined if both are undefined
 */
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

/**
 * Build a map of agent runs by ticket primary key, selecting the most relevant run per ticket.
 * A ticket can have multiple runs (implementation + QA + retries). This function selects
 * the most relevant run for each ticket: prefer any non-terminal run; otherwise the most recent run.
 * @param runRows - Array of agent run rows
 * @returns Record mapping ticket PK to the most relevant run for that ticket
 */
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

/**
 * Handlers for moving tickets when work buttons are clicked (Supabase board mode)
 */

import type { Column } from './columnTypes'
import type { SupabaseTicketRow } from './workButtonHandlers'

/**
 * Handles moving implementation agent ticket to Doing column
 */
export async function handleImplementationAgentMove(
  firstCardId: string,
  supabaseColumns: Column[],
  supabaseTickets: SupabaseTicketRow[],
  updateSupabaseTicketKanban: (
    pk: string,
    updates: {
      kanban_column_id?: string
      kanban_position?: number
      kanban_moved_at?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>,
  refetchSupabaseTickets: (
    skipPendingMoves?: boolean
  ) => Promise<{ success: boolean; freshTickets?: SupabaseTicketRow[] }>,
  fetchActiveAgentRuns?: (
    freshTickets?: SupabaseTicketRow[]
  ) => Promise<void>,
  setActiveWorkAgentTypes?: React.Dispatch<
    React.SetStateAction<Record<string, 'Implementation' | 'QA'>>
  >
): Promise<void> {
  const ticket = supabaseTickets.find((t) => t.pk === firstCardId)
  if (
    !ticket ||
    (ticket.kanban_column_id !== 'col-todo' &&
      ticket.kanban_column_id !== 'col-unassigned' &&
      ticket.kanban_column_id !== null)
  ) {
    return
  }

  const targetColumn = supabaseColumns.find((c) => c.id === 'col-doing')
  if (!targetColumn) return

  const targetPosition = targetColumn.cardIds.length
  const movedAt = new Date().toISOString()

  // Set agent type label immediately when button is clicked (0135)
  if (setActiveWorkAgentTypes) {
    setActiveWorkAgentTypes((prev) => ({
      ...prev,
      [firstCardId]: 'Implementation',
    }))
  }

  const result = await updateSupabaseTicketKanban(firstCardId, {
    kanban_column_id: 'col-doing',
    kanban_position: targetPosition,
    kanban_moved_at: movedAt,
  })

  if (result.ok) {
    setTimeout(() => {
      refetchSupabaseTickets(false).then((result) => {
        // Refetch agent runs since ticket moved to Doing (0135)
        // Pass fresh tickets directly from refetch result to avoid stale state reads
        if (fetchActiveAgentRuns && result.freshTickets) {
          fetchActiveAgentRuns(result.freshTickets)
        } else if (fetchActiveAgentRuns) {
          // Fallback: ref should be updated by now, but use it as backup
          fetchActiveAgentRuns()
        }
      })
    }, 500)
  } else if (result.error) {
    // Show explicit error message (0159)
    console.error('[QA Top Ticket] Failed to move ticket:', result.error)
    // Error will be visible via updateSupabaseTicketKanban error handling
    // Clear agent type on failure
    if (setActiveWorkAgentTypes) {
      setActiveWorkAgentTypes((prev) => {
        const next = { ...prev }
        delete next[firstCardId]
        return next
      })
    }
  }
}

/**
 * Handles moving QA agent ticket to Doing column
 */
export async function handleQAAgentMove(
  firstCardId: string,
  supabaseColumns: Column[],
  supabaseTickets: SupabaseTicketRow[],
  updateSupabaseTicketKanban: (
    pk: string,
    updates: {
      kanban_column_id?: string
      kanban_position?: number
      kanban_moved_at?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>,
  refetchSupabaseTickets: (
    skipPendingMoves?: boolean
  ) => Promise<{ success: boolean; freshTickets?: SupabaseTicketRow[] }>,
  fetchActiveAgentRuns?: (
    freshTickets?: SupabaseTicketRow[]
  ) => Promise<void>,
  setActiveWorkAgentTypes?: React.Dispatch<
    React.SetStateAction<Record<string, 'Implementation' | 'QA'>>
  >
): Promise<void> {
  const ticket = supabaseTickets.find((t) => t.pk === firstCardId)
  if (!ticket || ticket.kanban_column_id !== 'col-qa') {
    return
  }

  const targetColumn = supabaseColumns.find((c) => c.id === 'col-doing')
  if (!targetColumn) return

  const targetPosition = targetColumn.cardIds.length
  const movedAt = new Date().toISOString()

  // Set agent type label immediately when button is clicked (0135)
  if (setActiveWorkAgentTypes) {
    setActiveWorkAgentTypes((prev) => ({
      ...prev,
      [firstCardId]: 'QA',
    }))
  }

  const result = await updateSupabaseTicketKanban(firstCardId, {
    kanban_column_id: 'col-doing',
    kanban_position: targetPosition,
    kanban_moved_at: movedAt,
  })

  if (result.ok) {
    setTimeout(() => {
      refetchSupabaseTickets(false).then((result) => {
        // Refetch agent runs since ticket moved to Doing (0135)
        // Pass fresh tickets directly from refetch result to avoid stale state reads
        if (fetchActiveAgentRuns && result.freshTickets) {
          fetchActiveAgentRuns(result.freshTickets)
        } else if (fetchActiveAgentRuns) {
          // Fallback: ref should be updated by now, but use it as backup
          fetchActiveAgentRuns()
        }
      })
    }, 500)
  } else if (result.error) {
    // Show explicit error message (0159)
    console.error('[QA Top Ticket] Failed to move ticket:', result.error)
    // Error will be visible via updateSupabaseTicketKanban error handling
    // Clear agent type on failure
    if (setActiveWorkAgentTypes) {
      setActiveWorkAgentTypes((prev) => {
        const next = { ...prev }
        delete next[firstCardId]
        return next
      })
    }
  }
}

/**
 * Work button click handlers for SortableColumn
 */

import type { HalKanbanContextValue } from '../HalKanbanContext'
import type { Column } from './columnTypes'
import type { WorkButtonConfig } from './workButtonConfig'
import { isProcessReviewConfig } from './workButtonConfig'
import {
  handleImplementationAgentMove,
  handleQAAgentMove,
} from './workButtonMoveHandlers'

export type SupabaseTicketRow = {
  pk: string
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
  updated_at: string
  repo_full_name?: string
  ticket_number?: number
  display_id?: string
  pr_url?: string | null
  pr_number?: number | null
  branch_name?: string | null
  base_commit_sha?: string | null
  head_commit_sha?: string | null
}

export interface WorkButtonHandlers {
  handleProcessReview: (ticketPk: string, ticketId?: string) => Promise<void>
  handleWorkButtonClick: () => Promise<void>
}

/**
 * Handles process review button click
 */
async function handleProcessReviewButtonClick(
  hasTickets: boolean,
  firstCardId: string | null,
  topTicketId: string | null,
  halCtx: HalKanbanContextValue | null
): Promise<void> {
  if (!hasTickets || !firstCardId) return

  // Library mode: HAL owns data; tell HAL to trigger Process Review
  if (halCtx?.onProcessReview) {
    await halCtx.onProcessReview({
      ticketPk: firstCardId,
      ticketId: topTicketId ?? undefined,
    })
    return
  }

  // Iframe/standalone: postMessage to parent
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage(
      {
        type: 'HAL_PROCESS_REVIEW',
        ticketPk: firstCardId,
        ticketId: topTicketId ?? undefined,
      },
      '*'
    )
  }
}

/**
 * Creates work button handlers for SortableColumn
 */
export function createWorkButtonHandlers({
  col: _col,
  hasTickets,
  firstCardId,
  topTicketId,
  buttonConfig,
  halCtx,
  supabaseBoardActive,
  supabaseColumns,
  supabaseTickets,
  updateSupabaseTicketKanban,
  refetchSupabaseTickets,
  fetchActiveAgentRuns,
  setActiveWorkAgentTypes,
}: {
  col: Column
  hasTickets: boolean
  firstCardId: string | null
  topTicketId: string | null
  buttonConfig: WorkButtonConfig | null
  halCtx: HalKanbanContextValue | null
  supabaseBoardActive: boolean
  supabaseColumns: Column[]
  supabaseTickets: SupabaseTicketRow[]
  updateSupabaseTicketKanban?: (
    pk: string,
    updates: {
      kanban_column_id?: string
      kanban_position?: number
      kanban_moved_at?: string
    }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  refetchSupabaseTickets?: (
    skipPendingMoves?: boolean
  ) => Promise<{ success: boolean; freshTickets?: SupabaseTicketRow[] }>
  fetchActiveAgentRuns?: (
    freshTickets?: SupabaseTicketRow[]
  ) => Promise<void>
  setActiveWorkAgentTypes?: React.Dispatch<
    React.SetStateAction<Record<string, 'Implementation' | 'QA' | 'Process Review'>>
  >
}): WorkButtonHandlers {
  const handleProcessReview = async () => {
    await handleProcessReviewButtonClick(
      hasTickets,
      firstCardId,
      topTicketId,
      halCtx
    )
  }

  const handleWorkButtonClick = async () => {
    if (!hasTickets || !buttonConfig) return

    // Process Review uses a different handler
    if (isProcessReviewConfig(buttonConfig)) {
      await handleProcessReview()
      return
    }

    // Library mode: single ticket for all columns (including QA)
    if (halCtx?.onOpenChatAndSend && 'chatTarget' in buttonConfig) {
      halCtx.onOpenChatAndSend({
        chatTarget: buttonConfig.chatTarget,
        message: buttonConfig.message,
        ticketPk: firstCardId ?? undefined,
      })
      return
    }

    // Iframe/standalone: For Implementation agent, move ticket to Doing (0084) then postMessage
    if (
      'chatTarget' in buttonConfig &&
      buttonConfig.chatTarget === 'implementation-agent' &&
      supabaseBoardActive &&
      updateSupabaseTicketKanban &&
      refetchSupabaseTickets &&
      firstCardId
    ) {
      await handleImplementationAgentMove(
        firstCardId,
        supabaseColumns,
        supabaseTickets,
        updateSupabaseTicketKanban,
        refetchSupabaseTickets,
        fetchActiveAgentRuns,
        setActiveWorkAgentTypes
      )
    }

    // Iframe/standalone: For QA agent, move ticket from QA to Active Work (col-doing) when QA Top Ticket clicked (0159)
    if (
      'chatTarget' in buttonConfig &&
      buttonConfig.chatTarget === 'qa-agent' &&
      supabaseBoardActive &&
      updateSupabaseTicketKanban &&
      refetchSupabaseTickets &&
      firstCardId
    ) {
      await handleQAAgentMove(
        firstCardId,
        supabaseColumns,
        supabaseTickets,
        updateSupabaseTicketKanban,
        refetchSupabaseTickets,
        fetchActiveAgentRuns,
        setActiveWorkAgentTypes
      )
    }

    if (
      typeof window !== 'undefined' &&
      window.parent !== window &&
      'chatTarget' in buttonConfig &&
      buttonConfig.chatTarget
    ) {
      window.parent.postMessage(
        {
          type: 'HAL_OPEN_CHAT_AND_SEND',
          chatTarget: buttonConfig.chatTarget,
          message: buttonConfig.message,
        },
        '*'
      )
    }
  }

  return {
    handleProcessReview,
    handleWorkButtonClick,
  }
}

import React, { useContext } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HalKanbanContext } from '../HalKanbanContext'
import type { Column, Card } from '../lib/columnTypes'
import {
  shouldShowWorkButton,
  getWorkButtonConfig,
} from '../lib/workButtonConfig'
import { createWorkButtonHandlers } from '../lib/workButtonHandlers'
import type { SupabaseTicketRow } from '../lib/workButtonHandlers'
import { extractTicketId } from '../lib/ticketBody'
import { SortableCard } from './SortableCard'

export interface SortableColumnProps {
  col: Column
  cards: Record<string, Card>
  onRemove: (id: string) => void
  hideRemove?: boolean
  onOpenDetail?: (cardId: string) => void
  supabaseBoardActive?: boolean
  supabaseColumns?: Column[]
  supabaseTickets?: SupabaseTicketRow[]
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
  pendingMoves?: Set<string>
  fetchActiveAgentRuns?: (
    freshTickets?: SupabaseTicketRow[]
  ) => Promise<void>
  setActiveWorkAgentTypes?: React.Dispatch<
    React.SetStateAction<Record<string, 'Implementation' | 'QA' | 'Process Review'>>
  >
  activeWorkAgentTypes?: Record<string, 'Implementation' | 'QA' | 'Process Review'>
  sortableContextVersion?: number
  optimisticItems?: Map<string, string[]>
}

export function SortableColumn({
  col,
  cards,
  onRemove,
  hideRemove = false,
  onOpenDetail,
  supabaseBoardActive = false,
  supabaseColumns = [],
  supabaseTickets = [],
  updateSupabaseTicketKanban,
  refetchSupabaseTickets,
  pendingMoves = new Set(),
  fetchActiveAgentRuns,
  setActiveWorkAgentTypes,
  activeWorkAgentTypes = {},
  sortableContextVersion = 0,
  optimisticItems,
}: SortableColumnProps) {
  const halCtx = useContext(HalKanbanContext)
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: col.id,
      data: { type: 'column' },
    })
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: col.id,
    data: { type: 'column-drop', columnId: col.id },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Has tickets: column has cards (cardIds may be Supabase pk UUIDs, so don't rely on extractTicketId)
  const hasTickets = col.cardIds.length > 0
  const firstCard = hasTickets ? cards[col.cardIds[0]] : null
  const topTicketId = firstCard
    ? firstCard.displayId ?? extractTicketId(firstCard.id) ?? null
    : null

  const firstCardId = hasTickets ? col.cardIds[0] ?? null : null

  // Get work button configuration
  const buttonConfig = shouldShowWorkButton(col.id)
    ? getWorkButtonConfig(col, firstCard)
    : null
  const isProcessReviewRunning =
    halCtx?.processReviewRunningForTicketPk === firstCardId

  // Create work button handlers
  const { handleWorkButtonClick } = createWorkButtonHandlers({
    col,
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
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="column-card"
      data-column-id={col.id}
    >
      <div className="column-header">
        <span className="column-title" {...attributes} {...listeners}>
          {col.title}
        </span>
        <div className="column-header-actions">
          {shouldShowWorkButton(col.id) && buttonConfig && (
            <button
              type="button"
              className="column-work-button btn-standard"
              onClick={handleWorkButtonClick}
              disabled={!hasTickets || isProcessReviewRunning}
              aria-label={
                isProcessReviewRunning
                  ? 'Process Review in progress'
                  : hasTickets
                  ? buttonConfig.label
                  : 'No tickets in this column'
              }
              title={
                isProcessReviewRunning
                  ? 'Process Review in progress'
                  : hasTickets
                  ? buttonConfig.label
                  : 'No tickets in this column'
              }
            >
              {isProcessReviewRunning
                ? 'Reviewing...'
                : hasTickets
                ? buttonConfig.label || 'Work top ticket'
                : 'No tickets'}
            </button>
          )}
          {!hideRemove && (
            <button
              type="button"
              className="column-remove btn-destructive"
              onClick={() => onRemove(col.id)}
              aria-label={`Remove column ${col.title}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div
        ref={setDroppableRef}
        className={`column-cards ${isOver ? 'column-cards-over' : ''}`}
      >
        <SortableContext 
          key={`${col.id}-${sortableContextVersion}`}
          // Use optimistic items if available (for immediate @dnd-kit update), otherwise use computed items
          items={optimisticItems?.get(col.id) ?? col.cardIds}
          strategy={verticalListSortingStrategy}
        >
          {col.cardIds.map((cardId) => {
            const card = cards[cardId]
            if (!card) return null
            const activeWorkAgentType = activeWorkAgentTypes[cardId] || null
            return (
              <SortableCard
                key={card.id}
                card={card}
                columnId={col.id}
                onOpenDetail={onOpenDetail}
                activeWorkAgentType={activeWorkAgentType}
                isSaving={pendingMoves.has(cardId)}
              />
            )
          })}
        </SortableContext>
      </div>
    </div>
  )
}

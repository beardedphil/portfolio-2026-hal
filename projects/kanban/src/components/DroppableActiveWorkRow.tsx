import { useDroppable } from '@dnd-kit/core'
import { DraggableActiveWorkItem } from './DraggableActiveWorkItem'
import type { SupabaseTicketRow, SupabaseAgentRunRow } from '../App.types'
import { agentTypeToLabel } from '../lib/agentTypeLabel'

/** Droppable Active Work row component (0669): makes Active Work row a drop target */
export function DroppableActiveWorkRow({
  doingTickets,
  activeWorkAgentTypes,
  agentRunsByTicketPk,
  onOpenDetail,
  pendingMoves,
}: {
  doingTickets: SupabaseTicketRow[]
  activeWorkAgentTypes: Record<string, 'Implementation' | 'QA'>
  agentRunsByTicketPk: Record<string, SupabaseAgentRunRow>
  onOpenDetail: (ticketPk: string) => void
  pendingMoves: Set<string>
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'col-doing',
    data: { type: 'active-work-drop', columnId: 'col-doing' },
  })

  return (
    <section 
      className="active-work-row" 
      aria-label="Active Work"
      ref={setNodeRef}
    >
      <h2 className="active-work-title">Active Work</h2>
      <div className={`active-work-items ${isOver ? 'active-work-items-over' : ''}`}>
        {doingTickets.length > 0 ? (
          doingTickets.map((ticket) => {
            const agentRun = agentRunsByTicketPk[ticket.pk]
            // Prefer persisted agent run type (survives refresh/sync); fall back to local ephemeral map (0135).
            const agentName = agentTypeToLabel(agentRun?.agent_type) ?? activeWorkAgentTypes[ticket.pk] ?? null
            const timestamp = ticket.kanban_moved_at
              ? new Date(ticket.kanban_moved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ticket.updated_at
              ? new Date(ticket.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : null
            const displayId = ticket.display_id || (ticket.ticket_number ? `HAL-${String(ticket.ticket_number).padStart(4, '0')}` : null)
            const ticketIdentifier = displayId ? `${displayId}: ${ticket.title}` : ticket.title
            
            return (
              <DraggableActiveWorkItem
                key={ticket.pk}
                ticket={ticket}
                agentName={agentName}
                agentRun={agentRun}
                timestamp={timestamp}
                ticketIdentifier={ticketIdentifier}
                onOpenDetail={onOpenDetail}
                isSaving={pendingMoves.has(ticket.pk)}
              />
            )
          })
        ) : (
          <div className="active-work-empty">No active work</div>
        )}
      </div>
    </section>
  )
}

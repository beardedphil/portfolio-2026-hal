import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { StatusIndicator } from './StatusIndicator'
import type { SupabaseTicketRow, SupabaseAgentRunRow } from '../App.types'

/** Draggable Active Work item (0669): makes tickets in Active Work row draggable */
export function DraggableActiveWorkItem({
  ticket,
  agentName,
  agentRun,
  timestamp,
  ticketIdentifier,
  onOpenDetail,
  isSaving = false,
}: {
  ticket: SupabaseTicketRow
  agentName: string | null
  agentRun: SupabaseAgentRunRow | undefined
  timestamp: string | null
  ticketIdentifier: string
  onOpenDetail: (ticketPk: string) => void
  isSaving?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.pk,
    data: { type: 'active-work-item', ticketPk: ticket.pk, columnId: 'col-doing' },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : isSaving ? 0.7 : 1,
  }
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`active-work-item ${isSaving ? 'active-work-item-saving' : ''}`}
      data-ticket-pk={ticket.pk}
      aria-busy={isSaving}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail(ticket.pk)
        }
      }}
      aria-label={`Open ticket ${ticketIdentifier}`}
    >
      <span
        className="active-work-item-drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to move"
        title="Drag to move"
        onClick={(e) => {
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
      />
      <div 
        className="active-work-item-content"
        onClick={() => onOpenDetail(ticket.pk)}
      >
        <div className="active-work-item-title">{ticketIdentifier}</div>
        <div className="active-work-item-meta">
          <span className="active-work-item-agent">{agentName || 'Unassigned'}</span>
          <div className="active-work-item-status-row">
            <StatusIndicator agentRun={agentRun} agentName={agentName} />
            {timestamp && (
              <span className="active-work-item-timestamp" title={`Updated ${timestamp}`}>
                {timestamp}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

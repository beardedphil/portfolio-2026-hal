import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '../lib/columnTypes'

export function SortableCard({
  card,
  columnId,
  onOpenDetail,
  activeWorkAgentType,
  isSaving = false,
}: {
  card: Card
  columnId: string
  onOpenDetail?: (cardId: string) => void
  activeWorkAgentType?: 'Implementation' | 'QA' | 'Process Review' | null
  isSaving?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isSaving ? 0.7 : 1,
  }
  const handleCardClick = () => {
    if (onOpenDetail) onOpenDetail(card.id)
  }
  // Show badge for Doing column tickets: use activeWorkAgentType (set from source column) or "Unassigned" (0135)
  const showAgentBadge = columnId === 'col-doing'
  // Use activeWorkAgentType from state (set based on source column) instead of database lookup (0135)
  const agentName = activeWorkAgentType || null
  const badgeText = agentName || 'Unassigned'
  const badgeTitle = agentName ? `Working: ${agentName} Agent` : 'No agent currently working'
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`ticket-card ${isSaving ? 'ticket-card-saving' : ''}`} 
      data-card-id={card.id}
      aria-busy={isSaving}
    >
      <div className="ticket-card-top-row">
        <span
          className="ticket-card-drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Drag to move"
          title="Drag to move"
        />
        <button
          type="button"
          className="ticket-card-click-area"
          onClick={handleCardClick}
          aria-label={`Open ticket ${card.id}: ${card.title}`}
          disabled={isSaving}
        >
          <span className="ticket-card-title">{card.title}</span>
          {isSaving && (
            <span className="ticket-card-saving-indicator" aria-label="Saving" title="Saving...">
              <span className="ticket-card-saving-spinner"></span>
            </span>
          )}
        </button>
      </div>
      {showAgentBadge && (
        <span className="ticket-card-agent-badge" title={badgeTitle}>
          {badgeText}
        </span>
      )}
    </div>
  )
}

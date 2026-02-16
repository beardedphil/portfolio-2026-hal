/**
 * Draggable Supabase ticket list item component
 * Extracted from App.tsx to reduce file size
 */

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { SupabaseTicketRow } from '../App.types'

interface DraggableSupabaseTicketItemProps {
  row: SupabaseTicketRow
  onClick: () => void
  isSelected: boolean
}

/** Draggable Supabase ticket list item (0013): id is ticket id for DnD. */
export function DraggableSupabaseTicketItem({
  row,
  onClick,
  isSelected,
}: DraggableSupabaseTicketItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.pk,
    data: { type: 'supabase-ticket-from-list', id: row.pk },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }
  const displayId = row.display_id ?? row.id
  const cleanTitle = row.title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        type="button"
        className="ticket-file-btn"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        aria-pressed={isSelected}
      >
        {displayId} — {cleanTitle}
      </button>
    </li>
  )
}

/**
 * Work button configuration logic for SortableColumn
 */

import type { Column, Card } from './columnTypes'
import { extractTicketId } from './ticketBody'

export type WorkButtonConfig =
  | {
      label: string
      chatTarget: 'project-manager' | 'implementation-agent' | 'qa-agent'
      message: string
    }
  | {
      label: string
      isProcessReview: true
    }

/**
 * Determines if a column should show a work button
 */
export function shouldShowWorkButton(columnId: string): boolean {
  // Only show button for To-do column (HAL-0802: remove buttons from Unassigned, Ready for QA, and Process Review)
  return columnId === 'col-todo'
}

/**
 * Gets the work button configuration for a column
 */
export function getWorkButtonConfig(
  col: Column,
  firstCard: Card | null
): WorkButtonConfig | null {
  if (!shouldShowWorkButton(col.id)) {
    return null
  }

  const topTicketId = firstCard
    ? firstCard.displayId ?? extractTicketId(firstCard.id) ?? null
    : null
  const ticketRef = topTicketId ?? firstCard?.id ?? 'top'

  // Only To-do column has a button (HAL-0802: removed buttons from Unassigned, Ready for QA, and Process Review)
  if (col.id === 'col-todo') {
    return {
      label: 'Implement top ticket',
      chatTarget: 'implementation-agent',
      message: `Implement ticket ${ticketRef}.`,
    }
  }

  return null
}

/**
 * Checks if a work button config is for process review
 */
export function isProcessReviewConfig(
  config: WorkButtonConfig | null
): boolean {
  return config !== null && 'isProcessReview' in config && config.isProcessReview
}

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
  return (
    columnId === 'col-unassigned' ||
    columnId === 'col-todo' ||
    columnId === 'col-qa' ||
    columnId === 'col-process-review'
  )
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

  if (col.id === 'col-unassigned') {
    return {
      label: 'Prepare top ticket',
      chatTarget: 'project-manager',
      message: `Please prepare ticket ${ticketRef} and get it ready (Definition of Ready).`,
    }
  } else if (col.id === 'col-todo') {
    return {
      label: 'Implement top ticket',
      chatTarget: 'implementation-agent',
      message: `Implement ticket ${ticketRef}.`,
    }
  } else if (col.id === 'col-qa') {
    return {
      label: 'QA top ticket',
      chatTarget: 'qa-agent',
      message: `QA ticket ${ticketRef}.`,
    }
  } else if (col.id === 'col-process-review') {
    return {
      label: 'Review top ticket',
      isProcessReview: true,
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

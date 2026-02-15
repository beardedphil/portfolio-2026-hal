/**
 * Types for column and card data structures used by SortableColumn
 */

export type Card = {
  id: string
  title: string
  /** Display id for work button (e.g. HAL-0081); when card id is Supabase pk, used for message. */
  displayId?: string
}

export type Column = {
  id: string
  title: string
  cardIds: string[]
}

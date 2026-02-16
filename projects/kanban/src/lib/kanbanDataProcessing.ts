/**
 * Pure functions for processing kanban data (tickets, columns, cards)
 * Extracted from App.tsx to improve testability and maintainability
 */

import type { Column, Card } from './columnTypes'
import type { SupabaseTicketRow } from '../App.types'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'

/**
 * Processes tickets into columns with proper positioning and unknown column tracking.
 * 
 * @param sourceColumnsRows - Array of column definitions from Supabase
 * @param sourceTickets - Array of tickets to process
 * @returns Object with columns array and unknownColumnTicketIds array
 */
export function processTicketsIntoColumns(
  sourceColumnsRows: SupabaseKanbanColumnRow[],
  sourceTickets: SupabaseTicketRow[]
): { columns: Column[]; unknownColumnTicketIds: string[] } {
  if (sourceColumnsRows.length === 0) {
    return { columns: [], unknownColumnTicketIds: [] }
  }

  const columnIds = new Set(sourceColumnsRows.map((c) => c.id))
  const firstColumnId = sourceColumnsRows[0].id
  const byColumn: Record<string, { id: string; position: number }[]> = {}
  
  // Initialize empty arrays for each column
  for (const c of sourceColumnsRows) {
    byColumn[c.id] = []
  }
  
  const unknownIds: string[] = []
  
  // Assign tickets to columns
  for (const t of sourceTickets) {
    const colId =
      t.kanban_column_id == null || t.kanban_column_id === ''
        ? firstColumnId
        : columnIds.has(t.kanban_column_id)
          ? t.kanban_column_id
          : (unknownIds.push(t.pk), firstColumnId)
    const pos = typeof t.kanban_position === 'number' ? t.kanban_position : 0
    byColumn[colId].push({ id: t.pk, position: pos })
  }
  
  // Sort tickets within each column by position
  for (const id of Object.keys(byColumn)) {
    byColumn[id].sort((a, b) => a.position - b.position)
  }
  
  // Build final columns array
  const columns: Column[] = sourceColumnsRows.map((c) => ({
    id: c.id,
    title: c.title,
    cardIds: byColumn[c.id]?.map((x) => x.id) ?? [],
  }))
  
  return { columns, unknownColumnTicketIds: unknownIds }
}

/**
 * Creates card objects from ticket rows with cleaned titles and display IDs.
 * 
 * @param sourceTickets - Array of tickets to convert to cards
 * @returns Record mapping ticket pk to Card object
 */
export function createCardsFromTickets(
  sourceTickets: SupabaseTicketRow[]
): Record<string, Card> {
  const map: Record<string, Card> = {}
  for (const t of sourceTickets) {
    const cleanTitle = t.title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
    const display = t.display_id ? `${t.display_id} — ${cleanTitle}` : t.title
    const displayId = (t.display_id ?? (t.id ? String(t.id).padStart(4, '0') : undefined)) ?? undefined
    map[t.pk] = { id: t.pk, title: display, displayId }
  }
  return map
}

/**
 * Sorts tickets in the Doing column by position, then by moved_at timestamp.
 * Tickets with positions come first, sorted by position ascending.
 * Tickets without positions are sorted by moved_at descending (newer first).
 * 
 * @param tickets - Array of tickets to sort
 * @returns Sorted array of tickets
 */
export function sortDoingTickets(tickets: SupabaseTicketRow[]): SupabaseTicketRow[] {
  return [...tickets].sort((a, b) => {
    // Sort by position, then by moved_at timestamp
    if (a.kanban_position !== null && b.kanban_position !== null) {
      return a.kanban_position - b.kanban_position
    }
    if (a.kanban_position !== null) return -1
    if (b.kanban_position !== null) return 1
    // Both null position - sort by moved_at (newer first)
    if (a.kanban_moved_at && b.kanban_moved_at) {
      return new Date(b.kanban_moved_at).getTime() - new Date(a.kanban_moved_at).getTime()
    }
    if (a.kanban_moved_at) return -1
    if (b.kanban_moved_at) return 1
    return 0
  })
}

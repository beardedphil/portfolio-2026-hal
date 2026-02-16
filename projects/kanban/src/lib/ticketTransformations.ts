/**
 * Utility functions for transforming tickets into cards and organizing them into columns.
 * Extracted from App.tsx to improve maintainability and testability.
 */

import type { Card, Column } from './columnTypes'
import type { SupabaseTicketRow } from '../App.types'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'

/**
 * Cleans a ticket title by removing the ID prefix (e.g., "HAL-0079 — Title" -> "Title").
 * @param title The raw ticket title
 * @returns The cleaned title without the ID prefix
 */
export function cleanTicketTitle(title: string): string {
  return title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
}

/**
 * Transforms an array of Supabase ticket rows into a map of Card objects.
 * @param tickets Array of ticket rows from Supabase
 * @returns Record mapping ticket pk to Card object
 */
export function transformTicketsToCards(tickets: SupabaseTicketRow[]): Record<string, Card> {
  const map: Record<string, Card> = {}
  for (const t of tickets) {
    const cleanTitle = cleanTicketTitle(t.title)
    const display = t.display_id ? `${t.display_id} — ${cleanTitle}` : t.title
    const displayId = (t.display_id ?? (t.id ? String(t.id).padStart(4, '0') : undefined)) ?? undefined
    map[t.pk] = { id: t.pk, title: display, displayId }
  }
  return map
}

/**
 * Organizes tickets into columns based on their kanban_column_id and kanban_position.
 * @param sourceColumnsRows Array of column definitions from Supabase
 * @param sourceTickets Array of ticket rows from Supabase
 * @returns Object containing organized columns and list of tickets with unknown column IDs
 */
export function organizeTicketsIntoColumns(
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
  
  // Build final column structure
  const columns: Column[] = sourceColumnsRows.map((c) => ({
    id: c.id,
    title: c.title,
    cardIds: byColumn[c.id]?.map((x) => x.id) ?? [],
  }))
  
  return { columns, unknownColumnTicketIds: unknownIds }
}

export type SupabaseKanbanColumnRow = {
  id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

/** Unassigned, To-do, Doing, Ready for QA, Human in the Loop, Process Review, Done, Will Not Implement; tickets with null or col-unassigned go in Unassigned */
export const KANBAN_COLUMN_IDS = [
  'col-unassigned',
  'col-todo',
  'col-doing',
  'col-qa',
  'col-human-in-the-loop',
  'col-process-review',
  'col-done',
  'col-wont-implement',
] as const

/** Filter raw DB columns to canonical 8, in order; create fallbacks for missing. Use in connectSupabase and refetchSupabaseTickets. */
export function canonicalizeColumnRows(
  rows: SupabaseKanbanColumnRow[]
): SupabaseKanbanColumnRow[] {
  const canonicalOrder = KANBAN_COLUMN_IDS as unknown as string[]
  const filtered = rows.filter((c) => canonicalOrder.includes(c.id))
  const titleById: Record<string, string> = {
    'col-qa': 'Ready for QA',
  }
  return canonicalOrder.map((id, i) => {
    const row = filtered.find((c) => c.id === id)
    return (
      row ?? {
        id,
        title: titleById[id] ?? id.replace('col-', '').replace(/-/g, ' '),
        position: i,
        created_at: '',
        updated_at: '',
      }
    )
  }) as SupabaseKanbanColumnRow[]
}
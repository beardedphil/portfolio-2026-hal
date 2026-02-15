export type SupabaseTicketRow = {
  /** Internal unique row id (0079). */
  pk: string
  /** Legacy id (pre-0079). Not globally unique after repo-scoped migration. */
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
  updated_at: string
  /** Repo scope (0079). */
  repo_full_name?: string
  /** Per-repo ticket number (0079). */
  ticket_number?: number
  display_id: string
}

export function normalizeTicketRow(row: Partial<SupabaseTicketRow> & { id?: string }): SupabaseTicketRow {
  const legacyId = String(row.id ?? '').trim() || '0000'
  const pk = typeof row.pk === 'string' && row.pk.trim() ? row.pk.trim() : legacyId
  const displayId =
    typeof row.display_id === 'string' && row.display_id.trim()
      ? row.display_id.trim()
      : `LEG-${legacyId.padStart(4, '0')}`
  return {
    pk,
    id: legacyId,
    filename: String(row.filename ?? ''),
    title: String(row.title ?? ''),
    body_md: String(row.body_md ?? ''),
    kanban_column_id: (row.kanban_column_id ?? null) as string | null,
    kanban_position: (row.kanban_position ?? null) as number | null,
    kanban_moved_at: (row.kanban_moved_at ?? null) as string | null,
    updated_at: String(row.updated_at ?? ''),
    repo_full_name: row.repo_full_name,
    ticket_number: row.ticket_number,
    display_id: displayId,
  }
}
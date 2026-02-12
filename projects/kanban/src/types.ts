/**
 * Shared types for Kanban board data. HAL fetches these from Supabase and passes them down.
 */

/** Ticket row (matches Supabase tickets table). */
export interface KanbanTicketRow {
  pk: string
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
  updated_at: string
  repo_full_name?: string
  ticket_number?: number
  display_id?: string
}

/** Kanban column row (matches Supabase kanban_columns table). */
export interface KanbanColumnRow {
  id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

/** Agent run row (matches Supabase hal_agent_runs table). */
export interface KanbanAgentRunRow {
  run_id: string
  agent_type: 'implementation' | 'qa'
  repo_full_name: string
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  status: 'created' | 'launching' | 'polling' | 'finished' | 'failed'
  created_at: string
  updated_at: string
}

/** Agent artifact row (matches Supabase agent_artifacts table, 0082). Used when HAL fetches artifacts and passes to Kanban. */
export interface KanbanAgentArtifactRow {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

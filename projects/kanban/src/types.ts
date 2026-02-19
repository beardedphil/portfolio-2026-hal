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
  github_pr_url?: string | null
  github_pr_number?: number | null
  github_branch_name?: string | null
  github_base_commit_sha?: string | null
  github_head_commit_sha?: string | null
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
  agent_type: 'implementation' | 'qa' | 'process-review' | 'project-manager'
  repo_full_name: string
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  // Status is now the workflow step ID directly (0690)
  // Implementation: 'preparing' | 'fetching_ticket' | 'resolving_repo' | 'launching' | 'running' | 'completed' | 'failed'
  // QA: 'preparing' | 'fetching_ticket' | 'fetching_branch' | 'launching' | 'reviewing' | 'generating_report' | 'merging' | 'moving_ticket' | 'completed' | 'failed'
  // For backward compatibility, old values are still supported: 'created' | 'finished' | 'polling'
  status: 'preparing' | 'fetching_ticket' | 'resolving_repo' | 'fetching_branch' | 'launching' | 'running' | 'reviewing' | 'polling' | 'generating_report' | 'merging' | 'moving_ticket' | 'completed' | 'failed' | 'created' | 'finished'
  current_stage: string | null
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

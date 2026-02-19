/**
 * Types specific to App.tsx (extracted for better organization)
 */

export type LogEntry = { id: number; message: string; at: string }

/** Supabase tickets table row (read-only v0) */
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
  /** Human-facing display id like HAL-0079 (0079). */
  display_id?: string
  /** PR URL (0771). */
  pr_url?: string | null
  /** PR number (0771). */
  pr_number?: number | null
  /** Branch name (0771). */
  branch_name?: string | null
  /** Base commit SHA (0771). */
  base_commit_sha?: string | null
  /** Head commit SHA (0771). */
  head_commit_sha?: string | null
}

/** Supabase agent_artifacts table row (0082) - exported from components/types.ts */
export type SupabaseAgentArtifactRow = {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

/** Supabase hal_agent_runs table row (0114) */
export type SupabaseAgentRunRow = {
  run_id: string
  agent_type: 'implementation' | 'qa' | 'process-review' | 'project-manager'
  repo_full_name: string
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  // Status can be legacy values or new workflow step IDs (0690)
  status:
    | 'preparing'
    | 'fetching_ticket'
    | 'resolving_repo'
    | 'fetching_branch'
    | 'launching'
    | 'running'
    | 'reviewing'
    | 'polling'
    | 'generating_report'
    | 'merging'
    | 'moving_ticket'
    | 'completed'
    | 'failed'
    | 'created'
    | 'finished'
  current_stage: string | null
  created_at: string
  updated_at: string
}

/** Supabase ticket_attachments table row (0092) - exported from components/types.ts */
export type TicketAttachment = {
  pk: string
  ticket_pk: string
  ticket_id: string
  filename: string
  mime_type: string
  data_url: string
  file_size: number | null
  created_at: string
}

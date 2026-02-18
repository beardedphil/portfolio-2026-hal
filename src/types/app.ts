import type { Agent, ImageAttachment } from '../lib/conversationStorage'

export type ChatTarget = Agent
export type { ImageAttachment }

export type ToolCallRecord = {
  name: string
  input: unknown
  output: unknown
}

export type TicketCreationResult = {
  id: string
  filename: string
  filePath: string
  syncSuccess: boolean
  syncError?: string
  /** True when create_ticket retried due to id/filename collision (0023). */
  retried?: boolean
  attempts?: number
  /** True when ticket was automatically moved to To Do (0083). */
  movedToTodo?: boolean
  /** Error message if auto-move to To Do failed (0083). */
  moveError?: string
  /** True if ticket is ready to start (0083). */
  ready?: boolean
  /** Missing items if ticket is not ready (0083). */
  missingItems?: string[]
  /** True if ticket was auto-fixed (formatting issues resolved) (0095). */
  autoFixed?: boolean
}

export type GithubAuthMe = {
  authenticated: boolean
  login: string | null
  scope: string | null
}

export type GithubRepo = {
  id: number
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
}

export type ConnectedGithubRepo = {
  fullName: string
  defaultBranch: string
  htmlUrl: string
  private: boolean
}

/** Artifact row shape (matches Kanban package KanbanAgentArtifactRow). HAL owns DB so we type locally. */
export type ArtifactRow = {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

export const CHAT_OPTIONS: { id: ChatTarget; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent' },
  { id: 'qa-agent', label: 'QA' },
  { id: 'process-review-agent', label: 'Process Review' },
]

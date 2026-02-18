/**
 * Shared types for the HAL app. Single source of truth for domain types.
 */

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

export type Agent = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'
export type ChatTarget = Agent

export type ImageAttachment = {
  file: File
  dataUrl: string
  filename: string
}

export type Message = {
  id: number
  agent: Agent | 'user' | 'system'
  content: string
  timestamp: Date
  imageAttachments?: ImageAttachment[]
  promptText?: string
}

export type Conversation = {
  id: string
  agentRole: Agent
  instanceNumber: number
  messages: Message[]
  createdAt: Date
  oldestLoadedSequence?: number
  hasMoreMessages?: boolean
}

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
  retried?: boolean
  attempts?: number
  movedToTodo?: boolean
  moveError?: string
  ready?: boolean
  missingItems?: string[]
  autoFixed?: boolean
}

export type PmAgentResponse = {
  reply: string
  toolCalls: ToolCallRecord[]
  outboundRequest: object | null
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  ticketCreationResult?: TicketCreationResult
  createTicketAvailable?: boolean
  agentRunner?: string
  promptText?: string
}

export type Theme = 'light' | 'dark' | 'lcars' | 'arrested'

export type DiagnosticsInfo = {
  kanbanRenderMode: string
  selectedChatTarget: ChatTarget
  pmImplementationSource: 'hal-agents' | 'inline'
  lastAgentError: string | null
  lastError: string | null
  openaiLastStatus: string | null
  openaiLastError: string | null
  kanbanLoaded: boolean
  kanbanUrl: string
  connectedProject: string | null
  lastPmOutboundRequest: object | null
  lastPmToolCalls: ToolCallRecord[] | null
  lastTicketCreationResult: TicketCreationResult | null
  lastCreateTicketAvailable: boolean | null
  persistenceError: string | null
  agentRunner: string | null
  autoMoveDiagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>
  theme: Theme
  themeSource: 'default' | 'saved'
  lastSendPayloadSummary: string | null
  repoInspectionAvailable: boolean
  kanbanBuild: string
  unitTestsConfigured: boolean
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

/** Working memory shape from PM API (0173). */
export type WorkingMemory = {
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  open_questions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  last_updated_at: string
}

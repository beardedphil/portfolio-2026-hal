import type { Agent } from '../../lib/conversationStorage'

export type DiagnosticsInfo = {
  kanbanRenderMode: string
  selectedChatTarget: Agent
  pmImplementationSource: 'hal-agents' | 'inline'
  lastAgentError: string | null
  lastError: string | null
  openaiLastStatus: string | null
  openaiLastError: string | null
  kanbanLoaded: boolean
  kanbanUrl: string
  /** Kanban library build id (e.g. git commit); confirms which bundle is loaded. */
  kanbanBuild: string
  connectedProject: string | null
  lastPmOutboundRequest: object | null
  lastPmToolCalls: ToolCallRecord[] | null
  lastTicketCreationResult: TicketCreationResult | null
  lastCreateTicketAvailable: boolean | null
  persistenceError: string | null
  pmLastResponseId: string | null
  previousResponseIdInLastRequest: boolean
  /** Agent runner label from last PM response (e.g. "v2 (shared)"). */
  agentRunner: string | null
  /** Auto-move diagnostics entries (0061). */
  autoMoveDiagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>
  /** Current theme and source (0078). */
  theme: 'light' | 'dark'
  themeSource: 'default' | 'saved'
  /** Last send payload summary (0077). */
  lastSendPayloadSummary: string | null
  /** True when GitHub repo is connected; enables PM agent read_file/search_files via GitHub API. */
  repoInspectionAvailable: boolean
  /** Unit tests configuration status (0548). */
  unitTestsConfigured: boolean
  /** Message shown when conversation history was reset due to corruption (0549). */
  conversationHistoryResetMessage: string | null
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
}

export type WorkingMemory = {
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  openQuestions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  lastUpdatedAt: string
}

export type ChatTarget = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'

export type Theme = 'light' | 'dark'

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
}

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
  kanbanBuild: string
  connectedProject: string | null
  lastPmOutboundRequest: object | null
  lastPmToolCalls: ToolCallRecord[] | null
  lastTicketCreationResult: TicketCreationResult | null
  lastCreateTicketAvailable: boolean | null
  persistenceError: string | null
  pmLastResponseId: string | null
  previousResponseIdInLastRequest: boolean
  agentRunner: string | null
  autoMoveDiagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>
  theme: Theme
  themeSource: 'default' | 'saved'
  lastSendPayloadSummary: string | null
  repoInspectionAvailable: boolean
  unitTestsConfigured: boolean
  conversationHistoryResetMessage: string | null
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

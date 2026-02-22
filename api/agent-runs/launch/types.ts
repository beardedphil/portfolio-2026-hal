export type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

export type RequestBody = {
  agentType?: AgentType
  repoFullName?: string
  ticketNumber?: number
  defaultBranch?: string
  message?: string
  conversationId?: string
  projectId?: string
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
  model?: string
}

export type TicketData = {
  pk: string
  displayId: string
  bodyMd: string
  currentColumnId: string | null
}

export type ParsedTicketContent = {
  goal: string
  deliverable: string
  criteria: string
}

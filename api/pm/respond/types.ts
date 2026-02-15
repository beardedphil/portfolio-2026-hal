export type PmAgentResponse = {
  reply: string
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>
  outboundRequest: object | null
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  ticketCreationResult?: {
    id: string
    filename: string
    filePath: string
    syncSuccess: boolean
    syncError?: string
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
  createTicketAvailable?: boolean
  agentRunner?: string
  /** Full prompt text sent to the LLM (0202) */
  promptText?: string
}

export type RequestBody = {
  message?: string
  conversationHistory?: Array<{ role: string; content: string }>
  previous_response_id?: string
  projectId?: string
  conversationId?: string
  repoFullName?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
}

/**
 * Response type from PM agent endpoint.
 * Matches the interface expected from hal-agents runPmAgent().
 */
export interface PmAgentResponse {
  reply: string
  toolCalls: Array<{
    name: string
    input: unknown
    output: unknown
  }>
  outboundRequest: object | null
  /** OpenAI Responses API response id for continuity (send as previous_response_id on next turn). */
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  /** When create_ticket succeeded: id, file path, sync result; retried/attempts when collision retry (0023). */
  ticketCreationResult?: {
    id: string
    filename: string
    filePath: string
    syncSuccess: boolean
    syncError?: string
    retried?: boolean
    attempts?: number
  }
  /** True when Supabase creds were sent so create_ticket was available (for Diagnostics). */
  createTicketAvailable?: boolean
  /** Runner implementation label for diagnostics (e.g. "v2 (shared)"). */
  agentRunner?: string
}

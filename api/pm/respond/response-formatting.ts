import type { ServerResponse } from 'http'
import type { PmAgentResponse } from './types.js'

/**
 * Sends JSON response with specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Formats final PM agent response, including ticket creation result if present.
 */
export function formatResponse(
  result: {
    reply: string
    toolCalls?: Array<{ name: string; input: unknown; output: unknown }>
    outboundRequest?: object | null
    responseId?: string
    error?: string
    errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
    promptText?: string
  },
  createTicketAvailable: boolean,
  agentRunner: string,
  ticketCreationResult?: PmAgentResponse['ticketCreationResult'],
  debugInfo?: Record<string, unknown>
): PmAgentResponse {
  const response: PmAgentResponse = {
    reply: result.reply,
    toolCalls: result.toolCalls ?? [],
    outboundRequest: result.outboundRequest ?? null,
    ...(result.responseId != null && { responseId: result.responseId }),
    ...(result.error != null && { error: result.error }),
    ...(result.errorPhase != null && { errorPhase: result.errorPhase }),
    ...(ticketCreationResult != null && { ticketCreationResult }),
    createTicketAvailable,
    agentRunner,
    ...(result.promptText != null && { promptText: result.promptText }),
  }

  // Include debug info if provided (0119)
  if (debugInfo) {
    return {
      ...response,
      _debug: debugInfo,
    } as PmAgentResponse & { _debug: Record<string, unknown> }
  }

  return response
}

import type { PmAgentResponse } from './types.js'

/**
 * Extracts ticket creation result from tool calls if present.
 */
export function extractTicketCreationResult(
  toolCalls?: Array<{ name: string; input: unknown; output: unknown }>
): PmAgentResponse['ticketCreationResult'] {
  if (!toolCalls) return undefined

  const createTicketCall = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )

  if (!createTicketCall) return undefined

  const out = createTicketCall.output as any
  return {
    id: String(out.display_id ?? out.id ?? ''),
    filename: String(out.filename ?? ''),
    filePath: String(out.filePath ?? ''),
    syncSuccess: true,
    ...(out.retried && out.attempts != null && { retried: true, attempts: out.attempts }),
    ...(out.movedToTodo && { movedToTodo: true }),
    ...(out.moveError && { moveError: String(out.moveError) }),
    ...(typeof out.ready === 'boolean' && { ready: out.ready }),
    ...(Array.isArray(out.missingItems) && out.missingItems.length > 0 && { missingItems: out.missingItems }),
    ...(out.autoFixed && { autoFixed: true }),
  }
}

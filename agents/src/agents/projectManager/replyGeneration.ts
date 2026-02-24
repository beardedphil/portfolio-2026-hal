/**
 * Helper functions for generating fallback replies when the LLM doesn't generate text.
 */

import type { ToolCallRecord } from '../projectManager.js'

/**
 * Checks if an error is an abort error (from AbortSignal or AbortError).
 */
export function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' && String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Generates a fallback reply when the LLM returns no text but tool calls were made.
 * This ensures users see clear outcomes even when the model doesn't generate a response.
 */
export function generateFallbackReply(toolCalls: ToolCallRecord[]): string {
  // Check for placeholder validation failures first
  const createTicketRejected = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
  )
  if (createTicketRejected) {
    const out = createTicketRejected.output as {
      error: string
      detectedPlaceholders?: string[]
    }
    let reply = `**Ticket creation rejected:** ${out.error}`
    if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
      reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
    }
    reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
    return reply
  }

  const updateTicketRejected = toolCalls.find(
    (c) =>
      c.name === 'update_ticket_body' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
  )
  if (updateTicketRejected) {
    const out = updateTicketRejected.output as {
      error: string
      detectedPlaceholders?: string[]
    }
    let reply = `**Ticket update rejected:** ${out.error}`
    if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
      reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
    }
    reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
    return reply
  }

  // create_ticket failed (no repo, API error, etc.) — surface error so user doesn't see "Completed."
  const createTicketFailed = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      !(c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
  )
  if (createTicketFailed) {
    const out = createTicketFailed.output as { error?: string }
    return `**Ticket creation failed:** ${out.error ?? 'Unknown error. Ask the user to connect a GitHub repository in HAL and try again.'}`
  }

  // Check for successful tool calls
  const createTicketCall = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (createTicketCall) {
    const out = createTicketCall.output as {
      id: string
      filename: string
      filePath: string
      ready?: boolean
      missingItems?: string[]
    }
    let reply = `I created ticket **${out.id}** at \`${out.filePath}\`. It should appear in the Kanban board under Unassigned (sync may run automatically).`
    if (out.ready === false && out.missingItems?.length) {
      reply += ` The ticket is not yet ready for To Do: ${out.missingItems.join('; ')}. Update the ticket or ask me to move it once it passes the Ready-to-start checklist.`
    }
    return reply
  }

  const moveCall = toolCalls.find(
    (c) =>
      c.name === 'kanban_move_ticket_to_todo' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (moveCall) {
    const out = moveCall.output as { ticketId: string; fromColumn: string; toColumn: string }
    return `I moved ticket **${out.ticketId}** from ${out.fromColumn} to **${out.toColumn}**. It should now appear under To Do on the Kanban board.`
  }

  const updateBodyCall = toolCalls.find(
    (c) =>
      c.name === 'update_ticket_body' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (updateBodyCall) {
    const out = updateBodyCall.output as {
      ticketId: string
      ready?: boolean
      missingItems?: string[]
    }
    let reply = `I updated the body of ticket **${out.ticketId}** via the HAL API. The Kanban UI will reflect the change within ~10 seconds.`
    if (out.ready === false && out.missingItems?.length) {
      reply += ` Note: the ticket may still not pass readiness: ${out.missingItems.join('; ')}.`
    }
    return reply
  }

  const syncTicketsCall = toolCalls.find(
    (c) =>
      c.name === 'sync_tickets' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (syncTicketsCall) {
    return 'I ran sync-tickets. docs/tickets/*.md now match Supabase (Supabase is the source of truth).'
  }

  const listTicketsCall = toolCalls.find(
    (c) =>
      c.name === 'list_tickets_by_column' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (listTicketsCall) {
    const out = listTicketsCall.output as {
      column_id: string
      tickets: Array<{ id: string; title: string; column: string }>
      count: number
    }
    if (out.count === 0) {
      return `No tickets found in column **${out.column_id}**.`
    }
    const ticketList = out.tickets.map((t) => `- **${t.id}** — ${t.title}`).join('\n')
    return `Tickets in **${out.column_id}** (${out.count}):\n\n${ticketList}`
  }

  const listReposCall = toolCalls.find(
    (c) =>
      c.name === 'list_available_repos' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (listReposCall) {
    const out = listReposCall.output as {
      repos: Array<{ repo_full_name: string }>
      count: number
    }
    if (out.count === 0) {
      return `No repositories found in the database.`
    }
    const repoList = out.repos.map((r) => `- **${r.repo_full_name}**`).join('\n')
    return `Available repositories (${out.count}):\n\n${repoList}`
  }

  const moveToOtherRepoCall = toolCalls.find(
    (c) =>
      c.name === 'kanban_move_ticket_to_other_repo_todo' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (moveToOtherRepoCall) {
    const out = moveToOtherRepoCall.output as {
      ticketId: string
      display_id?: string
      fromRepo: string
      toRepo: string
      fromColumn: string
      toColumn: string
    }
    return `I moved ticket **${out.display_id ?? out.ticketId}** from **${out.fromRepo}** (${out.fromColumn}) to **${out.toRepo}** (${out.toColumn}). The ticket is now in the To Do column of the target repository.`
  }

  // Any other tool call with an error — surface it so user never sees generic "Completed."
  const firstWithError = toolCalls.find(
    (c) =>
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      typeof (c.output as { error?: string }).error === 'string'
  )
  if (firstWithError) {
    const out = firstWithError.output as { error: string }
    return `**${firstWithError.name}:** ${out.error}`
  }

  // Had tool calls but no recognized outcome — still show something so we don't fall back to "Completed."
  if (toolCalls.length > 0) {
    return `I ran ${toolCalls.length} tool call(s). If you expected a ticket or other change and don’t see it, try again or check that a GitHub repository is connected.`
  }

  return ''
}

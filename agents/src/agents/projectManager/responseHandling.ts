/**
 * Response handling utilities for PM agent.
 * Extracted from runPmAgent.ts to improve maintainability.
 */

import type { ToolCallRecord } from './types.js'

/**
 * Build fallback reply when model returns no text.
 */
export function buildFallbackReply(toolCalls: ToolCallRecord[]): string {
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
      c.name === 'move_ticket_to_column' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean; column_id?: string }).success === true &&
      (c.output as { column_id?: string }).column_id === 'col-todo'
  )
  if (moveCall) {
    const out = moveCall.output as { ticket_id: string; column_id: string; column_name?: string }
    return `I moved ticket **${out.ticket_id}** to **To Do**. It should now appear under To Do on the Kanban board.`
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
    let reply = `I updated the body of ticket **${out.ticketId}** in Supabase. The Kanban UI will reflect the change within ~10 seconds.`
    if (out.ready === false && out.missingItems?.length) {
      reply += ` Note: the ticket may still not pass readiness: ${out.missingItems.join('; ')}.`
    }
    return reply
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

  return ''
}

/**
 * Kanban-related tools for PM agent.
 * Extracted from projectManager.ts to reduce complexity.
 */

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import { COL_UNASSIGNED, COL_TODO } from '../projectManager.js'
import type { ToolCallRecord } from '../projectManager.js'

export function createKanbanMoveTicketToTodoTool(
  halFetchJson: (path: string, body: unknown, opts?: { timeoutMs?: number; progressMessage?: string }) => Promise<{ ok: boolean; json: any }>,
  toolCalls: ToolCallRecord[],
  isAbortError: (err: unknown) => boolean
) {
  return tool({
    description:
      'Move a ticket from Unassigned to To Do via the HAL API. Only call after evaluate_ticket_ready returns ready: true.',
    parameters: jsonSchema<{ ticket_id: string; position: 'top' | 'bottom' | null }>({
      type: 'object',
      additionalProperties: false,
      properties: {
        ticket_id: {
          type: 'string',
          description: 'Ticket id (e.g. "HAL-0012", "0012", or "12").',
        },
        position: {
          type: ['string', 'null'],
          enum: ['top', 'bottom', null],
          description:
            'Position in To Do column: "top" to place at position 0 (first card), "bottom" to place at end (default). Use "top" when called from "Prepare top ticket" workflow.',
        },
      },
      required: ['ticket_id', 'position'],
    }),
    execute: async (input: { ticket_id: string; position: 'top' | 'bottom' | null }) => {
      type MoveResult =
        | { success: true; ticketId: string; fromColumn: string; toColumn: string }
        | { success: false; error: string }
      let out: MoveResult
      try {
        const { json: fetched } = await halFetchJson(
          '/api/tickets/get',
          { ticketId: input.ticket_id },
          { timeoutMs: 20_000, progressMessage: `Checking current column for ${input.ticket_id}…` }
        )
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
          return out
        }
        const ticket = fetched.ticket as any
        const currentCol = ticket.kanban_column_id ?? null
        const inUnassigned = currentCol === COL_UNASSIGNED || currentCol === null || currentCol === ''
        if (!inUnassigned) {
          out = {
            success: false,
            error: `Ticket is not in Unassigned (current column: ${currentCol ?? 'null'}). Only tickets in Unassigned can be moved to To Do.`,
          }
          toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
          return out
        }
        const ticketIdToMove = String(ticket.display_id || input.ticket_id)
        const position = input.position ?? 'bottom'
        const { json: moved } = await halFetchJson(
          '/api/tickets/move',
          { ticketId: ticketIdToMove, columnId: COL_TODO, position },
          { timeoutMs: 25_000, progressMessage: `Moving ${ticketIdToMove} to To Do…` }
        )
        if (!moved?.success) {
          out = { success: false, error: moved?.error || 'Failed to move ticket' }
        } else {
          out = { success: true, ticketId: ticketIdToMove, fromColumn: COL_UNASSIGNED, toColumn: COL_TODO }
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
      return out
    },
  })
}

export function createListTicketsByColumnTool(
  halBaseUrl: string,
  toolCalls: ToolCallRecord[],
  config: { projectId?: string }
) {
  return tool({
    description:
      'List all tickets in a given Kanban column via the HAL API (server-side Supabase secret key).',
    parameters: z.object({
      column_id: z
        .string()
        .describe('Kanban column ID (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop").'),
    }),
    execute: async (input: { column_id: string }) => {
      type ListResult =
        | {
            success: true
            column_id: string
            tickets: Array<{ id: string; title: string; column: string }>
            count: number
          }
        | { success: false; error: string }
      let out: ListResult
      try {
        const repoFullName =
          typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : undefined
        const res = await fetch(`${halBaseUrl}/api/tickets/list-by-column`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: input.column_id, ...(repoFullName ? { repoFullName } : {}) }),
        })
        const data = (await res.json()) as any
        if (!data?.success) {
          out = { success: false, error: data?.error || 'Failed to list tickets' }
          toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
          return out
        }
        const tickets = (Array.isArray(data.tickets) ? data.tickets : []).map((t: any) => ({
          id: t.display_id ?? t.id,
          title: t.title ?? '',
          column: input.column_id,
        }))
        out = { success: true, column_id: input.column_id, tickets, count: tickets.length }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
      return out
    },
  })
}

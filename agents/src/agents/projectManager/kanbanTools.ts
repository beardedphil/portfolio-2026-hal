/**
 * Kanban-related tools extracted from projectManager.ts to improve maintainability.
 */

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import type { ToolCallRecord } from '../projectManager.js'
import type { HalFetchJson } from './halApiClient.js'

export function createKanbanTools(
  toolCalls: ToolCallRecord[],
  halBaseUrl: string,
  halFetchJson: HalFetchJson,
  config: { projectId?: string | null }
) {
  const listTicketsByColumnTool = tool({
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

  const moveTicketToColumnTool = tool({
    description:
      'Move a ticket to a specified Kanban column by name (e.g. "Ready to Do", "QA", "Human in the Loop", "Will Not Implement") or column ID. Optionally specify position: "top", "bottom", or a numeric index (0-based). The Kanban UI will reflect the change within ~10 seconds. Use when the user asks to move a ticket to a named column or reorder within a column. For bulk moves, call this once per ticket (max 5 per request).',
    parameters: z
      .object({
        ticket_id: z.string().describe('Ticket ID (e.g. "HAL-0121", "0121", or "121").'),
        column_name: z
          .union([z.string(), z.null()])
          .describe(
            'Column name (e.g. "Ready to Do", "To Do", "QA", "Human in the Loop"). Pass null when using column_id.'
          ),
        column_id: z
          .union([z.string(), z.null()])
          .describe(
            'Column ID (e.g. "col-todo", "col-qa", "col-human-in-the-loop"). Pass null when using column_name.'
          ),
        position: z
          .union([z.string(), z.number(), z.null()])
          .describe(
            'Position in column: "top" (move to top), "bottom" (move to bottom, default), or a number (0-based index, e.g. 0 for first, 1 for second). Pass null for the default ("bottom").'
          ),
      })
      .refine(
        (input) =>
          (typeof input.column_name === 'string' && input.column_name.trim().length > 0) ||
          (typeof input.column_id === 'string' && input.column_id.trim().length > 0),
        {
          message: 'Either column_name or column_id must be provided.',
          path: ['column_name'],
        }
      ),
    execute: async (input: {
      ticket_id: string
      column_name: string | null
      column_id: string | null
      position: string | number | null
    }) => {
      type MoveResult =
        | {
            success: true
            ticket_id: string
            column_id: string
            column_name?: string
            position: number
            moved_at: string
          }
        | { success: false; error: string }
      let out: MoveResult
      try {
        const baseUrl = process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app'
        const columnName =
          typeof input.column_name === 'string' && input.column_name.trim().length > 0
            ? input.column_name
            : undefined
        const columnId =
          typeof input.column_id === 'string' && input.column_id.trim().length > 0
            ? input.column_id
            : undefined
        const position = input.position ?? undefined

        const response = await fetch(`${baseUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: input.ticket_id,
            columnId,
            columnName,
            position,
          }),
        })

        const result = await response.json()
        if (result.success) {
          out = {
            success: true,
            ticket_id: input.ticket_id,
            column_id: result.columnId,
            ...(result.columnName && { column_name: result.columnName }),
            position: result.position,
            moved_at: result.movedAt,
          }
        } else {
          out = { success: false, error: result.error || 'Failed to move ticket' }
        }
      } catch (err) {
        out = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      toolCalls.push({ name: 'move_ticket_to_column', input, output: out })
      return out
    },
  })

  const listAvailableReposTool = tool({
    description:
      'List all repositories (repo_full_name) that have tickets in the database via the HAL API.',
    parameters: z.object({}),
    execute: async () => {
      type ListReposResult =
        | { success: true; repos: Array<{ repo_full_name: string }>; count: number }
        | { success: false; error: string }
      let out: ListReposResult
      try {
        const res = await fetch(`${halBaseUrl}/api/tickets/list-repos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = (await res.json()) as any
        if (!data?.success) {
          out = { success: false, error: data?.error || 'Failed to list repos' }
        } else {
          out = {
            success: true,
            repos: Array.isArray(data.repos) ? data.repos : [],
            count: typeof data.count === 'number' ? data.count : (Array.isArray(data.repos) ? data.repos.length : 0),
          }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'list_available_repos', input: {}, output: out })
      return out
    },
  })

  const kanbanMoveTicketToOtherRepoTodoTool = tool({
    description:
      "Move a ticket to another repository's To Do. Disabled for PM agent until a dedicated HAL API endpoint exists (PM agent must be endpoint-only).",
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0012", "0012", or "12").'),
      target_repo_full_name: z.string().describe('Target repository full name (e.g. "owner/other-repo").'),
    }),
    execute: async (input: { ticket_id: string; target_repo_full_name: string }) => {
      const out = {
        success: false as const,
        error:
          'kanban_move_ticket_to_other_repo_todo is disabled: PM agent must not access Supabase directly, and there is not yet a HAL API endpoint for cross-repo moves.',
      }
      toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
      return out
    },
  })

  return {
    list_tickets_by_column: listTicketsByColumnTool,
    move_ticket_to_column: moveTicketToColumnTool,
    list_available_repos: listAvailableReposTool,
    kanban_move_ticket_to_other_repo_todo: kanbanMoveTicketToOtherRepoTodoTool,
  }
}

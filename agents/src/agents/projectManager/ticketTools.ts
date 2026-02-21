/**
 * Ticket-related tool definitions extracted from projectManager.ts to improve maintainability.
 */

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import type { ToolCallRecord } from '../projectManager.js'
import type { PmAgentConfig } from './contextBuilding.js'
import {
  normalizeBodyForReady,
  normalizeTitleLineInBody,
} from '../../lib/ticketBodyNormalization.js'
import {
  slugFromTitle,
  parseTicketNumber,
  evaluateTicketReady,
  PLACEHOLDER_RE,
} from '../../lib/projectManagerHelpers.js'
import { COL_UNASSIGNED, COL_TODO } from '../projectManager.js'

type HalFetchJson = (
  path: string,
  body: unknown,
  opts?: { timeoutMs?: number; progressMessage?: string }
) => Promise<{ ok: boolean; json: any }>

type IsAbortError = (err: unknown) => boolean

export function createTicketTools(
  toolCalls: ToolCallRecord[],
  config: PmAgentConfig,
  halFetchJson: HalFetchJson,
  isAbortError: IsAbortError
) {
  const createTicketTool = tool({
    description:
      'Create a new ticket via the HAL API (server-side Supabase secret key). The ticket is created in Unassigned; if it already passes the Ready-to-start checklist, HAL may auto-move it to To Do.',
    parameters: z.object({
      title: z.string().describe('Short title for the ticket (no ID prefix).'),
      body_md: z.string().describe('Full markdown body for the ticket. No unresolved placeholders.'),
    }),
    execute: async (input: { title: string; body_md: string }) => {
      type CreateResult =
        | {
            success: true
            id: string
            display_id?: string
            ticket_number?: number
            repo_full_name?: string
            filename: string
            filePath: string
            ready: boolean
            missingItems?: string[]
            movedToTodo?: boolean
            moveError?: string
          }
        | { success: false; error: string; detectedPlaceholders?: string[] }

      let out: CreateResult
      try {
        let bodyMdTrimmed = input.body_md.trim()
        const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
        if (placeholders.length > 0) {
          const uniquePlaceholders = [...new Set(placeholders)]
          out = {
            success: false,
            error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}.`,
            detectedPlaceholders: uniquePlaceholders,
          }
          toolCalls.push({ name: 'create_ticket', input, output: out })
          return out
        }

        bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

        const repoFullName =
          typeof config.projectId === 'string' && config.projectId.trim()
            ? config.projectId.trim()
            : 'beardedphil/portfolio-2026-hal'

        const { json: created } = await halFetchJson(
          '/api/tickets/create-general',
          {
            title: input.title.trim(),
            body_md: bodyMdTrimmed,
            repo_full_name: repoFullName,
            kanban_column_id: COL_UNASSIGNED,
          },
          { timeoutMs: 25_000, progressMessage: `Creating ticket: ${input.title.trim()}` }
        )
        if (!created?.success || !created?.ticketId) {
          out = { success: false, error: created?.error || 'Failed to create ticket' }
          toolCalls.push({ name: 'create_ticket', input, output: out })
          return out
        }

        const displayId = String(created.ticketId)
        const ticketPk = typeof created.pk === 'string' ? created.pk : undefined
        const ticketNumber = parseTicketNumber(displayId)
        const id = String(ticketNumber ?? 0).padStart(4, '0')
        const filename = `${id}-${slugFromTitle(input.title)}.md`
        const filePath = `supabase:tickets/${displayId}`

        const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)
        // Persist normalized Title line (and strip QA blocks server-side).
        try {
          await halFetchJson(
            '/api/tickets/update',
            {
              ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
              body_md: normalizedBodyMd,
            },
            { timeoutMs: 20_000, progressMessage: `Normalizing ticket body for ${displayId}` }
          )
        } catch {
          // Non-fatal: ticket is still created.
        }

        const readiness = evaluateTicketReady(normalizedBodyMd)

        let movedToTodo = false
        let moveError: string | undefined
        if (readiness.ready) {
          const { json: moved } = await halFetchJson(
            '/api/tickets/move',
            { ticketId: displayId, columnId: COL_TODO, position: 'bottom' },
            { timeoutMs: 25_000, progressMessage: `Moving ${displayId} to To Do…` }
          )
          if (moved?.success) movedToTodo = true
          else moveError = moved?.error || 'Failed to move to To Do'
        }

        out = {
          success: true,
          id,
          display_id: displayId,
          ...(typeof ticketNumber === 'number' ? { ticket_number: ticketNumber } : {}),
          repo_full_name: repoFullName,
          filename,
          filePath,
          ready: readiness.ready,
          ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
          ...(movedToTodo ? { movedToTodo: true } : {}),
          ...(moveError ? { moveError } : {}),
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      toolCalls.push({ name: 'create_ticket', input, output: out })
      return out
    },
  })

  const fetchTicketContentTool = tool({
    description:
      'Fetch the full ticket content (body_md, title, id/display_id, kanban_column_id) and artifacts via the HAL API (server-side Supabase secret key).',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket reference (e.g. "HAL-0012", "0012", or "12").'),
    }),
    execute: async (input: { ticket_id: string }) => {
      const ticketNumber = parseTicketNumber(input.ticket_id)
      const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
      type FetchResult =
        | {
            success: true
            id: string
            display_id?: string
            ticket_number?: number
            repo_full_name?: string
            title: string
            body_md: string
            kanban_column_id: string | null
            artifacts: Array<{
              artifact_id: string
              ticket_pk: string
              repo_full_name?: string | null
              agent_type: string
              title: string
              body_md: string | null
              created_at: string
              updated_at?: string | null
            }>
            artifacts_error?: string
            ticket?: Record<string, any>
          }
        | { success: false; error: string }

      let out: FetchResult
      try {
        const { json: data } = await halFetchJson(
          '/api/tickets/get',
          { ticketId: input.ticket_id },
          { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id}…` }
        )
        if (!data?.success || !data?.ticket) {
          out = { success: false, error: data?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
          return out
        }

        const ticket = data.ticket as any
        out = {
          success: true,
          id: ticket.id ?? normalizedId,
          display_id: ticket.display_id ?? undefined,
          ticket_number: ticket.ticket_number ?? undefined,
          repo_full_name: ticket.repo_full_name ?? undefined,
          title: ticket.title ?? '',
          body_md: data.body_md ?? ticket.body_md ?? '',
          kanban_column_id: ticket.kanban_column_id ?? null,
          artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
          ...(data.artifacts_error ? { artifacts_error: String(data.artifacts_error) } : {}),
          ticket,
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
      return out
    },
  })

  const updateTicketBodyTool = tool({
    description:
      "Update a ticket's body_md via the HAL API (server-side Supabase secret key). Use when the user asks to edit/fix a ticket or make it Ready-to-start.",
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0037", "0037", or "37").'),
      body_md: z.string().describe('Full markdown body. No placeholders.'),
    }),
    execute: async (input: { ticket_id: string; body_md: string }) => {
      type UpdateResult =
        | { success: true; ticketId: string; ready: boolean; missingItems?: string[] }
        | { success: false; error: string; detectedPlaceholders?: string[] }
      let out: UpdateResult
      try {
        let bodyMdTrimmed = input.body_md.trim()
        const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
        if (placeholders.length > 0) {
          const uniquePlaceholders = [...new Set(placeholders)]
          out = {
            success: false,
            error: `Ticket update rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}.`,
            detectedPlaceholders: uniquePlaceholders,
          }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

        // Fetch ticket to get display_id / pk for robust update.
        const { json: fetched } = await halFetchJson(
          '/api/tickets/get',
          { ticketId: input.ticket_id },
          { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id} for update…` }
        )
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        const ticket = fetched.ticket as any
        const displayId = String(ticket.display_id || input.ticket_id)
        const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
        const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)

        const { json: updated } = await halFetchJson(
          '/api/tickets/update',
          {
            ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
            body_md: normalizedBodyMd,
          },
          { timeoutMs: 20_000, progressMessage: `Updating ticket body for ${displayId}…` }
        )
        if (!updated?.success) {
          out = { success: false, error: updated?.error || 'Failed to update ticket' }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        const readiness = evaluateTicketReady(normalizedBodyMd)
        out = {
          success: true,
          ticketId: displayId,
          ready: readiness.ready,
          ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'update_ticket_body', input, output: out })
      return out
    },
  })

  const evaluateTicketReadyTool = tool({
    description:
      'Evaluate ticket body against the Ready-to-start checklist (Definition of Ready). Pass body_md from fetch_ticket_content. Returns ready (boolean), missingItems (list), and checklistResults. Always call this before kanban_move_ticket_to_todo; do not move if not ready.',
    parameters: z.object({
      body_md: z.string().describe('Full markdown body of the ticket (e.g. from fetch_ticket_content).'),
    }),
    execute: async (input: { body_md: string }) => {
      const out = evaluateTicketReady(input.body_md)
      toolCalls.push({ name: 'evaluate_ticket_ready', input: { body_md: input.body_md.slice(0, 500) + (input.body_md.length > 500 ? '...' : '') }, output: out })
      return out
    },
  })

  const kanbanMoveTicketToTodoTool = tool({
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
        // Fetch current column and preferred display id
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

  return {
    create_ticket: createTicketTool,
    fetch_ticket_content: fetchTicketContentTool,
    update_ticket_body: updateTicketBodyTool,
    evaluate_ticket_ready: evaluateTicketReadyTool,
    kanban_move_ticket_to_todo: kanbanMoveTicketToTodoTool,
  }
}

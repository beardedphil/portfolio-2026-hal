/**
 * Tool definitions for the PM agent.
 * Extracted from projectManager.ts to improve maintainability.
 */

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
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
import { type ToolContext, readFile, searchFiles, listDirectory } from '../tools.js'
import type { ToolCallRecord } from '../projectManager.js'
import { COL_UNASSIGNED, COL_TODO } from '../projectManager.js'

export interface ToolDependencies {
  toolCalls: ToolCallRecord[]
  halFetchJson: (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number; progressMessage?: string }
  ) => Promise<{ ok: boolean; json: any }>
  config: {
    projectId?: string | null
    repoRoot: string
    repoFullName?: string | null
    githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
    githubSearchCode?: (pattern: string, glob: string) => Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }>
    githubListDirectory?: (path: string) => Promise<{ entries: string[] } | { error: string }>
  }
  isAbortError: (err: unknown) => boolean
  ctx: ToolContext
  hasGitHubRepo: boolean
  repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }>
}

export function createTools(deps: ToolDependencies) {
  const { toolCalls, halFetchJson, config, isAbortError, ctx, hasGitHubRepo, repoUsage } = deps

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

  const attachImageToTicketTool = tool({
    description:
      'Attach an uploaded image to a ticket. This PM agent must call HAL endpoints and must not write to Supabase directly; image-attachment via API is not yet implemented.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "HAL-0143", "0143", or "143").'),
      image_index: z
        .number()
        .int()
        .min(0)
        .describe('Zero-based index of the image to attach (0 is first).'),
    }),
    execute: async (input: { ticket_id: string; image_index?: number }) => {
      const out = {
        success: false as const,
        error:
          'attach_image_to_ticket is temporarily unavailable: PM agent is endpoint-only and there is not yet a HAL API endpoint for image attachments. Use the UI workflow to attach the image, or add a dedicated endpoint.',
      }
      toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
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

  const syncTicketsTool = tool({
    description:
      'Sync docs/tickets from Supabase. Disabled for PM agent: PM must be endpoint-only and must not require Supabase credentials in its environment.',
    parameters: z.object({}),
    execute: async () => {
      const out = {
        success: false as const,
        error:
          'sync_tickets is disabled for the PM agent. Supabase is the source of truth and should be accessed via HAL server endpoints; if you need a migration sync, run it server-side with privileged credentials.',
      }
      toolCalls.push({ name: 'sync_tickets', input: {}, output: out })
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
        const halBaseUrl = (process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app').trim()
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

  const moveTicketToColumnTool = (() => {
      return tool({
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
    })()

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
        const halBaseUrl = (process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app').trim()
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

  type CreateRedDocumentInput = {
    ticket_id: string
    red_json_content: string
  }

  const createRedDocumentTool = tool({
    description:
      'Create a Requirement Expansion Document (RED) for a ticket via the HAL API. RED documents are required before a ticket can be moved to To Do.',
    parameters: jsonSchema<CreateRedDocumentInput>({
      type: 'object',
      additionalProperties: false,
      properties: {
        ticket_id: {
          type: 'string',
          description: 'Ticket id (e.g. "HAL-0012", "0012", or "12").',
        },
        red_json_content: {
          type: 'string',
          description:
            'RED document content as a JSON string. Should contain expanded requirements, use cases, edge cases, and other detailed information. Will be parsed as JSON.',
        },
      },
      required: ['ticket_id', 'red_json_content'],
    }),
    execute: async (input: CreateRedDocumentInput) => {
      type CreateRedResult =
        | {
            success: true
            red_document: {
              red_id: string
              version: number
              ticket_pk: string
              repo_full_name: string
            }
          }
        | { success: false; error: string }
      let out: CreateRedResult
      try {
        // Fetch ticket to get ticketPk and repoFullName
        const { json: fetched } = await halFetchJson(
          '/api/tickets/get',
          { ticketId: input.ticket_id },
          { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id} for RED…` }
        )
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        const ticket = fetched.ticket as any
        const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
        const repoFullName = typeof ticket.repo_full_name === 'string' ? ticket.repo_full_name : undefined

        if (!ticketPk || !repoFullName) {
          out = {
            success: false,
            error: `Could not determine ticket_pk or repo_full_name for ticket ${input.ticket_id}.`,
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        // Idempotency: if a RED already exists, reuse it instead of creating new versions.
        const { json: existing } = await halFetchJson(
          '/api/red/list',
          { ticketPk, repoFullName },
          { timeoutMs: 20_000, progressMessage: `Checking existing REDs for ${input.ticket_id}…` }
        )
        if (existing?.success && Array.isArray(existing.red_versions) && existing.red_versions.length > 0) {
          const latest = existing.red_versions[0] as any
          // Best-effort: ensure it's validated for "latest-valid" gates
          try {
            await halFetchJson(
              '/api/red/validate',
              {
                redId: latest.red_id,
                result: 'valid',
                createdBy: 'pm-agent',
                notes: 'Auto-validated existing RED for To Do gate.',
              },
              { timeoutMs: 20_000, progressMessage: `Validating existing RED for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal
          }

          // Best-effort: create/update mirrored RED artifact for visibility in ticket Artifacts.
          try {
            const vNum = Number(latest.version ?? 0) || 0
            const { json: redGet } = await halFetchJson(
              '/api/red/get',
              { ticketPk, ticketId: input.ticket_id, repoFullName, version: vNum },
              { timeoutMs: 20_000, progressMessage: `Loading latest RED JSON for ${input.ticket_id}…` }
            )
            const redDoc = redGet?.success ? redGet.red_document : null
            const redJsonForArtifact = redDoc?.red_json ?? null
            if (redJsonForArtifact != null) {
              const createdAt = typeof redDoc?.created_at === 'string' ? redDoc.created_at : new Date().toISOString()
              const validationStatus =
                typeof redDoc?.validation_status === 'string' ? redDoc.validation_status : 'pending'
              const artifactTitle = `RED v${vNum || redDoc?.version || 0} — ${createdAt.split('T')[0]}`
              const artifactBody = `# RED Document Version ${vNum || redDoc?.version || 0}

RED ID: ${String(latest.red_id)}
Created: ${createdAt}
Validation Status: ${validationStatus}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJsonForArtifact, null, 2)}
\`\`\`
`
              await halFetchJson(
                '/api/artifacts/insert-implementation',
                { ticketId: ticketPk, artifactType: 'red', title: artifactTitle, body_md: artifactBody },
                { timeoutMs: 25_000, progressMessage: `Saving RED artifact for ${input.ticket_id}…` }
              )
            }
          } catch {
            // Non-fatal
          }
          out = {
            success: true,
            red_document: {
              red_id: String(latest.red_id),
              version: Number(latest.version ?? 0) || 0,
              ticket_pk: ticketPk,
              repo_full_name: repoFullName,
            },
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        let redJsonParsed: unknown
        try {
          redJsonParsed = JSON.parse(input.red_json_content)
        } catch (parseErr) {
          out = {
            success: false,
            error: `Invalid JSON in red_json_content: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        // Create RED document via HAL API
        const { json: created } = await halFetchJson(
          '/api/red/insert',
          {
            ticketPk,
            repoFullName,
            redJson: redJsonParsed,
            validationStatus: 'pending',
            createdBy: 'pm-agent',
          },
          { timeoutMs: 25_000, progressMessage: `Creating RED for ${input.ticket_id}…` }
        )
        if (!created?.success || !created?.red_document) {
          out = { success: false, error: created?.error || 'Failed to create RED document' }
        } else {
          // Option A: validate via separate table (immutable RED rows)
          try {
            await halFetchJson(
              '/api/red/validate',
              {
                redId: created.red_document.red_id,
                result: 'valid',
                createdBy: 'pm-agent',
                notes: 'Auto-validated for To Do gate (PM-generated RED).',
              },
              { timeoutMs: 20_000, progressMessage: `Validating RED for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal: RED exists but may not satisfy latest-valid gates until validated.
          }

          // Best-effort: create/update mirrored RED artifact for visibility in ticket Artifacts.
          try {
            const savedRED = created.red_document as any
            const version = Number(savedRED?.version ?? 0) || 0
            const createdAt = typeof savedRED?.created_at === 'string' ? savedRED.created_at : new Date().toISOString()
            const validationStatus =
              typeof savedRED?.validation_status === 'string' ? savedRED.validation_status : 'pending'
            const redJsonForArtifact = savedRED?.red_json ?? redJsonParsed
            const artifactTitle = `RED v${version} — ${createdAt.split('T')[0]}`
            const artifactBody = `# RED Document Version ${version}

RED ID: ${String(savedRED?.red_id ?? '')}
Created: ${createdAt}
Validation Status: ${validationStatus}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJsonForArtifact, null, 2)}
\`\`\`
`
            await halFetchJson(
              '/api/artifacts/insert-implementation',
              { ticketId: ticketPk, artifactType: 'red', title: artifactTitle, body_md: artifactBody },
              { timeoutMs: 25_000, progressMessage: `Saving RED artifact for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal
          }
          out = {
            success: true,
            red_document: {
              red_id: created.red_document.red_id,
              version: created.red_document.version,
              ticket_pk: ticketPk,
              repo_full_name: repoFullName,
            },
          }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'create_red_document_v2', input, output: out })
      return out
    },
  })

  const readFileTool = tool({
    description: hasGitHubRepo
      ? 'Read file contents from the connected GitHub repo. Path is relative to repo root. Max 500 lines. Uses committed code on default branch.'
      : 'Read file contents from HAL repo. Path is relative to repo root. Max 500 lines.',
    parameters: z.object({
      path: z.string().describe('File path (relative to repo/project root)'),
    }),
    execute: async (input) => {
      let out: { content: string } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubReadFile)
      repoUsage.push({ tool: 'read_file', usedGitHub, path: input.path })
      if (hasGitHubRepo && config.githubReadFile) {
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to read: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubReadFile(input.path, 500)
      } else {
        // Debug: log when falling back to HAL repo (0119)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubReadFile=${typeof config.githubReadFile === 'function'})`)
        }
        out = await readFile(ctx, input)
      }
      toolCalls.push({ name: 'read_file', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const getInstructionSetTool = tool({
    description:
      'Load instruction content from HAL/Supabase. Use `agentType` to load a full agent instruction set (plus additional topic index), or `topicId` to load one specific topic.',
    parameters: z
      .object({
        topicId: z
          .string()
          .nullable()
          .describe(
            'Specific instruction topic ID (e.g., "auditability-and-traceability", "qa-audit-report", "done-means-pushed"). Set to null when loading by agentType.'
          ),
        agentType: z
          .enum([
            'project-manager',
            'implementation-agent',
            'qa-agent',
            'process-review-agent',
          ])
          .nullable()
          .describe(
            'Agent type for full instruction-set loading (loads all basic instructions for that agent plus additional topics). Set to null when loading a specific topic by topicId.'
          ),
      })
      .refine((value) => Boolean((value.topicId ?? '').trim() || value.agentType), {
        message: 'Provide either topicId or agentType.',
      }),
    execute: async (input) => {
      try {
        const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
        const agentTypeLabels: Record<
          'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent',
          string
        > = {
          'project-manager': 'Project Manager',
          'implementation-agent': 'Implementation Agent',
          'qa-agent': 'QA Agent',
          'process-review-agent': 'Process Review Agent',
        }

        const topicId = (input.topicId ?? '').trim()

        // First mode: full instruction set by agent type.
        if (input.agentType) {
          const targetAgentType = input.agentType
          type AgentInstruction = {
            topicId: string
            filename: string
            title: string
            description: string
            content: string
            agentTypes: string[]
            alwaysApply: boolean
          }

          const mapHalInstruction = (raw: Record<string, unknown>): AgentInstruction => {
            const rawTopicId = typeof raw.topicId === 'string' ? raw.topicId.trim() : ''
            const rawFilename = typeof raw.filename === 'string' ? raw.filename.trim() : ''
            const topicIdValue = rawTopicId || rawFilename.replace(/\.mdc$/i, '')
            const filenameValue = rawFilename || `${topicIdValue || 'unknown'}.mdc`
            const topicMeta = raw.topicMetadata as { title?: string; description?: string } | undefined
            const titleValue =
              (typeof raw.title === 'string' ? raw.title.trim() : '') ||
              topicMeta?.title ||
              filenameValue.replace(/\.mdc$/i, '').replace(/-/g, ' ')
            const descriptionValue =
              (typeof raw.description === 'string' ? raw.description.trim() : '') ||
              topicMeta?.description ||
              'No description'
            const contentValue =
              typeof raw.contentMd === 'string'
                ? raw.contentMd
                : typeof raw.contentBody === 'string'
                  ? raw.contentBody
                  : ''
            const agentTypesValue = Array.isArray(raw.agentTypes)
              ? raw.agentTypes.filter((v): v is string => typeof v === 'string')
              : []
            return {
              topicId: topicIdValue,
              filename: filenameValue,
              title: titleValue,
              description: descriptionValue,
              content: contentValue,
              agentTypes: agentTypesValue,
              alwaysApply: raw.alwaysApply === true,
            }
          }

          const dedupeTopics = (topics: Array<{ topicId: string; title: string; description: string }>) => {
            const seen = new Set<string>()
            const unique: Array<{ topicId: string; title: string; description: string }> = []
            for (const topic of topics) {
              if (!topic.topicId || seen.has(topic.topicId)) continue
              seen.add(topic.topicId)
              unique.push(topic)
            }
            return unique.sort((a, b) => a.topicId.localeCompare(b.topicId))
          }

          let basicInstructions: AgentInstruction[] = []
          let additionalTopicCandidates: AgentInstruction[] = []

          // Try HAL API first (preferred path)
          // In server/runtime contexts (e.g. Vercel), `.hal/api-base-url` usually doesn't exist.
          // Default to HAL_API_BASE_URL (or prod URL) so instruction loading works reliably.
          let halBaseUrl: string | null = (process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app').trim()
          try {
            const path = await import('path')
            const fs = await import('fs/promises')
            const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
            const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
            const candidate = apiBaseUrlContent.trim()
            if (candidate) halBaseUrl = candidate
          } catch {
            // .hal/api-base-url missing, try direct Supabase fallback.
          }

          if (halBaseUrl) {
            try {
              const [basicRes, situationalRes] = await Promise.all([
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: true,
                    includeSituational: false,
                  }),
                }),
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: false,
                    includeSituational: true,
                  }),
                }),
              ])

              if (basicRes.ok) {
                const basicData = (await basicRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (basicData.success && Array.isArray(basicData.instructions)) {
                  basicInstructions = basicData.instructions.map(mapHalInstruction)
                }
              }

              if (situationalRes.ok) {
                const situationalData = (await situationalRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (situationalData.success && Array.isArray(situationalData.instructions)) {
                  additionalTopicCandidates = situationalData.instructions.map(mapHalInstruction)
                }
              }
            } catch (apiErr) {
              console.warn('[PM Agent] HAL API agent instruction-set fetch failed, falling back:', apiErr)
            }
          }

          // No direct Supabase fallback: PM agent must be endpoint-only.

          if (basicInstructions.length === 0 && additionalTopicCandidates.length === 0) {
            const error = {
              error: `No instruction set found for agentType "${targetAgentType}". Ensure HAL/Supabase instruction data is available.`,
            }
            toolCalls.push({ name: 'get_instruction_set', input, output: error })
            return error
          }

          const additionalTopics = dedupeTopics(
            additionalTopicCandidates.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
            }))
          )

          const contentSections: string[] = []
          contentSections.push(`# Instruction set for ${agentTypeLabels[targetAgentType]}`)
          contentSections.push(
            `Loaded ${basicInstructions.length} basic instruction${basicInstructions.length === 1 ? '' : 's'} for \`${targetAgentType}\`.`
          )

          if (basicInstructions.length > 0) {
            contentSections.push('## Basic instructions (full set)')
            for (const inst of basicInstructions) {
              contentSections.push(`### ${inst.title} (\`${inst.topicId}\`)`)
              contentSections.push(inst.content)
            }
          }

          if (additionalTopics.length > 0) {
            contentSections.push('## Additional topics (request on-demand)')
            for (const topic of additionalTopics) {
              contentSections.push(
                `- **${topic.title}** (ID: \`${topic.topicId}\`): ${topic.description}`
              )
            }
            contentSections.push(
              'Request a topic with `get_instruction_set({ topicId: "<topic-id>" })` when a specific workflow is needed.'
            )
          }

          const result = {
            mode: 'agent-type',
            agentType: targetAgentType,
            title: `Instruction set for ${agentTypeLabels[targetAgentType]}`,
            basicInstructions: basicInstructions.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
              content: inst.content,
            })),
            additionalTopics,
            content: contentSections.join('\n\n'),
          }
          toolCalls.push({ name: 'get_instruction_set', input, output: result })
          return result
        }

        // Second mode: fetch one topic by topicId.
        if (!topicId) {
          const error = { error: 'Either topicId or agentType is required.' }
          toolCalls.push({ name: 'get_instruction_set', input, output: error })
          return error
        }

        // Try HAL API first (preferred method)
        let halBaseUrl: string | null = null
        try {
          const path = await import('path')
          const fs = await import('fs/promises')
          const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
          const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
          halBaseUrl = apiBaseUrlContent.trim()
        } catch {
          // .hal/api-base-url not found, will try direct Supabase
        }

        if (halBaseUrl) {
          try {
            const res = await fetch(`${halBaseUrl}/api/instructions/get-topic`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topicId,
                repoFullName,
              }),
            })

            if (res.ok) {
              const data = await res.json()
              if (data.success) {
                const result = {
                  topicId: data.topicId,
                  title: data.title,
                  description: data.description,
                  content: data.content || data.contentMd || '',
                }
                toolCalls.push({ name: 'get_instruction_set', input, output: result })
                return result
              } else {
                return { error: data.error || 'Failed to load instruction topic' }
              }
            }
          } catch (apiErr) {
            // HAL API failed, fall through to direct Supabase
            console.warn('[PM Agent] HAL API instruction topic fetch failed, falling back:', apiErr)
          }
        }

        // No direct Supabase fallback: PM agent must be endpoint-only.

        // Fallback to filesystem: Individual instruction files have been migrated to Supabase
        // The filesystem fallback can only provide the entry point file, not individual topics
        return { 
          error: `Cannot load instruction topic "${topicId}" from filesystem. Individual instruction files have been migrated to Supabase. Use HAL API endpoint \`/api/instructions/get-topic\` or direct Supabase access to retrieve instructions. If Supabase/HAL API is not available, instructions cannot be loaded.`
        }
      } catch (err) {
        const error = { 
          error: `Error loading instruction set: ${err instanceof Error ? err.message : String(err)}` 
        }
        toolCalls.push({ name: 'get_instruction_set', input, output: error })
        return error
      }
    },
  })

  const searchFilesTool = tool({
    description: hasGitHubRepo
      ? 'Search code in the connected GitHub repo. Pattern is used as search term (GitHub does not support full regex).'
      : 'Regex search across files in HAL repo. Pattern is JavaScript regex.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      glob: z.string().describe('Glob pattern to filter files (e.g. "**/*" for all, "**/*.ts" for TypeScript)'),
    }),
    execute: async (input) => {
      let out: { matches: Array<{ path: string; line: number; text: string }> } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubSearchCode)
      repoUsage.push({ tool: 'search_files', usedGitHub, path: input.pattern })
      if (hasGitHubRepo && config.githubSearchCode) {
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to search: ${config.repoFullName} pattern: ${input.pattern}`)
        }
        out = await config.githubSearchCode(input.pattern, input.glob)
      } else {
        // Debug: log when falling back to HAL repo (0119)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for search: ${input.pattern} (hasGitHubRepo=${hasGitHubRepo}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'})`)
        }
        out = await searchFiles(ctx, { pattern: input.pattern, glob: input.glob })
      }
      toolCalls.push({ name: 'search_files', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  return {
    get_instruction_set: getInstructionSetTool,
    list_directory: tool({
      description: hasGitHubRepo
        ? 'List files in a directory in the connected GitHub repo. Path is relative to repo root.'
        : 'List files in a directory in HAL repo. Path is relative to repo root.',
      parameters: z.object({
        path: z.string().describe('Directory path (relative to repo/project root)'),
      }),
      execute: async (input) => {
        let out: { entries: string[] } | { error: string }
        const usedGitHub = !!(hasGitHubRepo && config.githubListDirectory)
        repoUsage.push({ tool: 'list_directory', usedGitHub, path: input.path })
        if (hasGitHubRepo && config.githubListDirectory) {
          // Debug: log when using GitHub API (0119)
          if (typeof console !== 'undefined' && console.log) {
            console.log(`[PM Agent] Using GitHub API to list directory: ${config.repoFullName}/${input.path}`)
          }
          out = await config.githubListDirectory(input.path)
        } else {
          // Debug: log when falling back to HAL repo (0119)
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[PM Agent] Falling back to HAL repo for list_directory: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubListDirectory=${typeof config.githubListDirectory === 'function'})`)
          }
          out = await listDirectory(ctx, input)
        }
        toolCalls.push({ name: 'list_directory', input, output: out })
        return typeof (out as { error?: string }).error === 'string'
          ? JSON.stringify(out)
          : out
      },
    }),
    read_file: readFileTool,
    search_files: searchFilesTool,
    ...(createTicketTool ? { create_ticket: createTicketTool } : {}),
    ...(fetchTicketContentTool ? { fetch_ticket_content: fetchTicketContentTool } : {}),
    ...(attachImageToTicketTool ? { attach_image_to_ticket: attachImageToTicketTool } : {}),
    evaluate_ticket_ready: evaluateTicketReadyTool,
    ...(updateTicketBodyTool ? { update_ticket_body: updateTicketBodyTool } : {}),
    ...(syncTicketsTool ? { sync_tickets: syncTicketsTool } : {}),
    ...(kanbanMoveTicketToTodoTool ? { kanban_move_ticket_to_todo: kanbanMoveTicketToTodoTool } : {}),
    ...(listTicketsByColumnTool ? { list_tickets_by_column: listTicketsByColumnTool } : {}),
    ...(moveTicketToColumnTool ? { move_ticket_to_column: moveTicketToColumnTool } : {}),
    ...(listAvailableReposTool ? { list_available_repos: listAvailableReposTool } : {}),
    ...(kanbanMoveTicketToOtherRepoTodoTool
      ? { kanban_move_ticket_to_other_repo_todo: kanbanMoveTicketToOtherRepoTodoTool }
      : {}),
    ...(createRedDocumentTool ? { create_red_document_v2: createRedDocumentTool } : {}),
  }
}

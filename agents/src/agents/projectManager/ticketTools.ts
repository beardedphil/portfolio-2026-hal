/**
 * Ticket-related tools for PM agent.
 * Extracted from projectManager.ts to reduce complexity.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  parseTicketNumber,
  slugFromTitle,
  evaluateTicketReady,
  PLACEHOLDER_RE,
} from '../../lib/projectManagerHelpers.js'
import {
  normalizeBodyForReady,
  normalizeTitleLineInBody,
} from '../../lib/ticketBodyNormalization.js'
import { COL_UNASSIGNED, COL_TODO } from '../projectManager.js'
import type { ToolCallRecord } from '../projectManager.js'

export function createTicketTool(
  halFetchJson: (path: string, body: unknown, opts?: { timeoutMs?: number; progressMessage?: string }) => Promise<{ ok: boolean; json: any }>,
  toolCalls: ToolCallRecord[],
  config: { projectId?: string },
  isAbortError: (err: unknown) => boolean
) {
  return tool({
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
}

export function createFetchTicketContentTool(
  halFetchJson: (path: string, body: unknown, opts?: { timeoutMs?: number; progressMessage?: string }) => Promise<{ ok: boolean; json: any }>,
  toolCalls: ToolCallRecord[],
  isAbortError: (err: unknown) => boolean
) {
  return tool({
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
}

export function createUpdateTicketBodyTool(
  halFetchJson: (path: string, body: unknown, opts?: { timeoutMs?: number; progressMessage?: string }) => Promise<{ ok: boolean; json: any }>,
  toolCalls: ToolCallRecord[],
  isAbortError: (err: unknown) => boolean
) {
  return tool({
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
}

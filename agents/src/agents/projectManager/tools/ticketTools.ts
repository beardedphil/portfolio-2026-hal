/**
 * Ticket-related tools for PM agent.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { evaluateTicketReady } from '../../../lib/projectManagerHelpers.js'
import { normalizeBodyForReady, normalizeTitleLineInBody } from '../../../lib/ticketBodyNormalization.js'
import { validatePlaceholders, executeCreateTicket, executeFetchTicketContent } from '../toolHelpers.js'
import { halFetchJson } from '../halApi.js'
import type { ToolCallRecord } from '../../projectManager.js'
import type { PmAgentConfig } from '../contextBuilding.js'

export interface TicketToolsDeps {
  toolCalls: ToolCallRecord[]
  halBaseUrl: string
  config: Pick<PmAgentConfig, 'projectId'> & { abortSignal?: AbortSignal; onProgress?: (message: string) => void | Promise<void> }
  isAbortError: (err: unknown) => boolean
}

/**
 * Create ticket-related tools.
 */
export function createTicketTools(deps: TicketToolsDeps) {
  const { toolCalls, halBaseUrl, config, isAbortError } = deps

  const createTicketTool = tool({
    description:
      'Create a new ticket via the HAL API (server-side Supabase secret key). The ticket is created in Unassigned; if it already passes the Ready-to-start checklist, HAL may auto-move it to To Do.',
    parameters: z.object({
      title: z.string().describe('Short title for the ticket (no ID prefix).'),
      body_md: z.string().describe('Full markdown body for the ticket. No unresolved placeholders.'),
    }),
    execute: async (input: { title: string; body_md: string }) => {
      let out
      try {
        out = await executeCreateTicket(input, config, halBaseUrl)
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
      let out
      try {
        out = await executeFetchTicketContent(input, halBaseUrl, {
          abortSignal: config.abortSignal,
          onProgress: config.onProgress,
        })
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
      toolCalls.push({
        name: 'evaluate_ticket_ready',
        input: { body_md: input.body_md.slice(0, 500) + (input.body_md.length > 500 ? '...' : '') },
        output: out,
      })
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
      let out
      try {
        const placeholderCheck = validatePlaceholders(input.body_md.trim())
        if (!placeholderCheck.valid) {
          out = {
            success: false,
            error: `Ticket update rejected: unresolved template placeholder tokens detected. Detected placeholders: ${placeholderCheck.placeholders!.join(', ')}.`,
            detectedPlaceholders: placeholderCheck.placeholders,
          }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        const bodyMdTrimmed = normalizeBodyForReady(input.body_md.trim())
        const { json: fetched } = await halFetchJson(halBaseUrl, '/api/tickets/get', { ticketId: input.ticket_id }, {
          timeoutMs: 20_000,
          progressMessage: `Fetching ticket ${input.ticket_id} for update…`,
          abortSignal: config.abortSignal,
          onProgress: config.onProgress,
        })
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
          halBaseUrl,
          '/api/tickets/update',
          {
            ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
            body_md: normalizedBodyMd,
          },
          {
            timeoutMs: 20_000,
            progressMessage: `Updating ticket body for ${displayId}…`,
            abortSignal: config.abortSignal,
            onProgress: config.onProgress,
          }
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

  return {
    create_ticket: createTicketTool,
    fetch_ticket_content: fetchTicketContentTool,
    attach_image_to_ticket: attachImageToTicketTool,
    evaluate_ticket_ready: evaluateTicketReadyTool,
    update_ticket_body: updateTicketBodyTool,
    sync_tickets: syncTicketsTool,
  }
}

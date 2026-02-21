/**
 * Tool implementations extracted from projectManager.ts for better testability and maintainability.
 * These functions contain the core logic for each tool, separated from the tool schema definitions.
 */

import { PLACEHOLDER_RE, parseTicketNumber, slugFromTitle, evaluateTicketReady } from '../../lib/projectManagerHelpers.js'
import { normalizeBodyForReady, normalizeTitleLineInBody } from '../../lib/ticketBodyNormalization.js'

export interface ToolContext {
  halFetchJson: (path: string, body: unknown, opts?: { timeoutMs?: number; progressMessage?: string }) => Promise<{ ok: boolean; json: any }>
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>
  isAbortError: (err: unknown) => boolean
  config: {
    projectId?: string
  }
  parseTicketNumber: typeof parseTicketNumber
  slugFromTitle: typeof slugFromTitle
  normalizeBodyForReady: typeof normalizeBodyForReady
  normalizeTitleLineInBody: typeof normalizeTitleLineInBody
  evaluateTicketReady: typeof evaluateTicketReady
  COL_UNASSIGNED: string
  COL_TODO: string
}

export interface CreateTicketInput {
  title: string
  body_md: string
}

export type CreateTicketResult =
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

/**
 * Core logic for create_ticket tool.
 * Validates placeholders, creates ticket via API, normalizes body, and optionally moves to To Do.
 */
export async function createTicketToolLogic(
  input: CreateTicketInput,
  ctx: ToolContext
): Promise<CreateTicketResult> {
  let out: CreateTicketResult
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
      ctx.toolCalls.push({ name: 'create_ticket', input, output: out })
      return out
    }

    bodyMdTrimmed = ctx.normalizeBodyForReady(bodyMdTrimmed)

    const repoFullName =
      typeof ctx.config.projectId === 'string' && ctx.config.projectId.trim()
        ? ctx.config.projectId.trim()
        : 'beardedphil/portfolio-2026-hal'

    const { json: created } = await ctx.halFetchJson(
      '/api/tickets/create-general',
      {
        title: input.title.trim(),
        body_md: bodyMdTrimmed,
        repo_full_name: repoFullName,
        kanban_column_id: ctx.COL_UNASSIGNED,
      },
      { timeoutMs: 25_000, progressMessage: `Creating ticket: ${input.title.trim()}` }
    )
    if (!created?.success || !created?.ticketId) {
      out = { success: false, error: created?.error || 'Failed to create ticket' }
      ctx.toolCalls.push({ name: 'create_ticket', input, output: out })
      return out
    }

    const displayId = String(created.ticketId)
    const ticketPk = typeof created.pk === 'string' ? created.pk : undefined
    const ticketNumber = ctx.parseTicketNumber(displayId)
    const id = String(ticketNumber ?? 0).padStart(4, '0')
    const filename = `${id}-${ctx.slugFromTitle(input.title)}.md`
    const filePath = `supabase:tickets/${displayId}`

    const normalizedBodyMd = ctx.normalizeTitleLineInBody(bodyMdTrimmed, displayId)
    // Persist normalized Title line (and strip QA blocks server-side).
    try {
      await ctx.halFetchJson(
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

    const readiness = ctx.evaluateTicketReady(normalizedBodyMd)

    let movedToTodo = false
    let moveError: string | undefined
    if (readiness.ready) {
      const { json: moved } = await ctx.halFetchJson(
        '/api/tickets/move',
        { ticketId: displayId, columnId: ctx.COL_TODO, position: 'bottom' },
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
    if (ctx.isAbortError(err)) throw err
    out = { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  ctx.toolCalls.push({ name: 'create_ticket', input, output: out })
  return out
}

export interface FetchTicketContentInput {
  ticket_id: string
}

export type FetchTicketContentResult =
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

/**
 * Core logic for fetch_ticket_content tool.
 * Fetches ticket data and artifacts from the HAL API.
 */
export async function fetchTicketContentToolLogic(
  input: FetchTicketContentInput,
  ctx: {
    halFetchJson: ToolContext['halFetchJson']
    toolCalls: ToolContext['toolCalls']
    isAbortError: ToolContext['isAbortError']
    parseTicketNumber: typeof parseTicketNumber
  }
): Promise<FetchTicketContentResult> {
  let out: FetchTicketContentResult
  try {
    const ticketNumber = ctx.parseTicketNumber(input.ticket_id)
    const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
    const { json: data } = await ctx.halFetchJson(
      '/api/tickets/get',
      { ticketId: input.ticket_id },
      { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id}…` }
    )
    if (!data?.success || !data?.ticket) {
      out = { success: false, error: data?.error || `Ticket ${input.ticket_id} not found.` }
      ctx.toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
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
    if (ctx.isAbortError(err)) throw err
    out = { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  ctx.toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
  return out
}

export interface UpdateTicketBodyInput {
  ticket_id: string
  body_md: string
}

export type UpdateTicketBodyResult =
  | { success: true; ticketId: string; ready: boolean; missingItems?: string[] }
  | { success: false; error: string; detectedPlaceholders?: string[] }

/**
 * Core logic for update_ticket_body tool.
 * Validates placeholders, updates ticket body via API, and evaluates readiness.
 */
export async function updateTicketBodyToolLogic(
  input: UpdateTicketBodyInput,
  ctx: {
    halFetchJson: ToolContext['halFetchJson']
    toolCalls: ToolContext['toolCalls']
    isAbortError: ToolContext['isAbortError']
    normalizeBodyForReady: typeof normalizeBodyForReady
    normalizeTitleLineInBody: typeof normalizeTitleLineInBody
    evaluateTicketReady: typeof evaluateTicketReady
  }
): Promise<UpdateTicketBodyResult> {
  let out: UpdateTicketBodyResult
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
      ctx.toolCalls.push({ name: 'update_ticket_body', input, output: out })
      return out
    }

    bodyMdTrimmed = ctx.normalizeBodyForReady(bodyMdTrimmed)

    // Fetch ticket to get display_id / pk for robust update.
    const { json: fetched } = await ctx.halFetchJson(
      '/api/tickets/get',
      { ticketId: input.ticket_id },
      { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id} for update…` }
    )
    if (!fetched?.success || !fetched?.ticket) {
      out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
      ctx.toolCalls.push({ name: 'update_ticket_body', input, output: out })
      return out
    }

    const ticket = fetched.ticket as any
    const displayId = String(ticket.display_id || input.ticket_id)
    const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
    const normalizedBodyMd = ctx.normalizeTitleLineInBody(bodyMdTrimmed, displayId)

    const { json: updated } = await ctx.halFetchJson(
      '/api/tickets/update',
      {
        ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
        body_md: normalizedBodyMd,
      },
      { timeoutMs: 20_000, progressMessage: `Updating ticket body for ${displayId}…` }
    )
    if (!updated?.success) {
      out = { success: false, error: updated?.error || 'Failed to update ticket' }
      ctx.toolCalls.push({ name: 'update_ticket_body', input, output: out })
      return out
    }

    const readiness = ctx.evaluateTicketReady(normalizedBodyMd)
    out = {
      success: true,
      ticketId: displayId,
      ready: readiness.ready,
      ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
    }
  } catch (err) {
    if (ctx.isAbortError(err)) throw err
    out = { success: false, error: err instanceof Error ? err.message : String(err) }
  }
  ctx.toolCalls.push({ name: 'update_ticket_body', input, output: out })
  return out
}

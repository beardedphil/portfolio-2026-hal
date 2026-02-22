/**
 * Tool execution helpers for PM agent.
 * Contains shared logic for tool execution (validation, HAL API calls, etc.).
 */

import { PLACEHOLDER_RE } from '../../lib/projectManagerHelpers.js'
import { normalizeBodyForReady, normalizeTitleLineInBody } from '../../lib/ticketBodyNormalization.js'
import {
  slugFromTitle,
  parseTicketNumber,
  evaluateTicketReady,
} from '../../lib/projectManagerHelpers.js'
import { halFetchJson, type HalFetchOptions } from './halApi.js'
import type { PmAgentConfig } from './contextBuilding.js'

export const COL_UNASSIGNED = 'col-unassigned'
export const COL_TODO = 'col-todo'

/**
 * Validate placeholders in ticket body.
 */
export function validatePlaceholders(bodyMd: string): { valid: boolean; placeholders?: string[] } {
  const placeholders = bodyMd.match(PLACEHOLDER_RE) ?? []
  if (placeholders.length > 0) {
    return { valid: false, placeholders: [...new Set(placeholders)] }
  }
  return { valid: true }
}

/**
 * Execute fetch ticket content tool logic.
 */
export async function executeFetchTicketContent(
  input: { ticket_id: string },
  halBaseUrl: string,
  opts: HalFetchOptions & { abortSignal?: AbortSignal; onProgress?: (message: string) => void | Promise<void> }
): Promise<{
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
} | { success: false; error: string }> {
  const ticketNumber = parseTicketNumber(input.ticket_id)
  const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
  const { json: data } = await halFetchJson(halBaseUrl, '/api/tickets/get', { ticketId: input.ticket_id }, {
    timeoutMs: 20_000,
    progressMessage: `Fetching ticket ${input.ticket_id}…`,
    ...opts,
  })
  if (!data?.success || !data?.ticket) {
    return { success: false, error: data?.error || `Ticket ${input.ticket_id} not found.` }
  }
  const ticket = data.ticket as any
  return {
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
}

/**
 * Execute create ticket tool logic.
 */
export async function executeCreateTicket(
  input: { title: string; body_md: string },
  config: Pick<PmAgentConfig, 'projectId'> & { abortSignal?: AbortSignal; onProgress?: (message: string) => void | Promise<void> },
  halBaseUrl: string
): Promise<{
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
} | { success: false; error: string; detectedPlaceholders?: string[] }> {
  const placeholderCheck = validatePlaceholders(input.body_md.trim())
  if (!placeholderCheck.valid) {
    return {
      success: false,
      error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${placeholderCheck.placeholders!.join(', ')}.`,
      detectedPlaceholders: placeholderCheck.placeholders,
    }
  }
  let bodyMdTrimmed = input.body_md.trim()

  bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)
  const repoFullName =
    typeof config.projectId === 'string' && config.projectId.trim()
      ? config.projectId.trim()
      : 'beardedphil/portfolio-2026-hal'

  const { json: created } = await halFetchJson(
    halBaseUrl,
    '/api/tickets/create-general',
    {
      title: input.title.trim(),
      body_md: bodyMdTrimmed,
      repo_full_name: repoFullName,
      kanban_column_id: COL_UNASSIGNED,
    },
    {
      timeoutMs: 25_000,
      progressMessage: `Creating ticket: ${input.title.trim()}`,
      abortSignal: config.abortSignal,
      onProgress: config.onProgress,
    }
  )
  if (!created?.success || !created?.ticketId) {
    return { success: false, error: created?.error || 'Failed to create ticket' }
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
      halBaseUrl,
      '/api/tickets/update',
      {
        ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
        body_md: normalizedBodyMd,
      },
      {
        timeoutMs: 20_000,
        progressMessage: `Normalizing ticket body for ${displayId}`,
        abortSignal: config.abortSignal,
        onProgress: config.onProgress,
      }
    )
  } catch {
    // Non-fatal: ticket is still created.
  }

  const readiness = evaluateTicketReady(normalizedBodyMd)
  let movedToTodo = false
  let moveError: string | undefined
  if (readiness.ready) {
    const { json: moved } = await halFetchJson(
      halBaseUrl,
      '/api/tickets/move',
      { ticketId: displayId, columnId: COL_TODO, position: 'bottom' },
      {
        timeoutMs: 25_000,
        progressMessage: `Moving ${displayId} to To Do…`,
        abortSignal: config.abortSignal,
        onProgress: config.onProgress,
      }
    )
    if (moved?.success) movedToTodo = true
    else moveError = moved?.error || 'Failed to move to To Do'
  }

  return {
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
}

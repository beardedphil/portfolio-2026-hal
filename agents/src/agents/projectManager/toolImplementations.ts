/**
 * Tool implementation logic extracted from projectManager.ts for testability and maintainability.
 * These functions contain the core business logic for PM agent tools.
 */

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

const COL_UNASSIGNED = 'col-unassigned'
const COL_TODO = 'col-todo'
import type { ToolCallRecord } from '../projectManager.js'

export interface PlaceholderValidationResult {
  hasPlaceholders: boolean
  placeholders: string[]
}

/**
 * Validates that a ticket body does not contain unresolved placeholder tokens.
 */
export function validatePlaceholders(body: string): PlaceholderValidationResult {
  const placeholders = body.match(PLACEHOLDER_RE) ?? []
  const uniquePlaceholders = [...new Set(placeholders)]
  return {
    hasPlaceholders: uniquePlaceholders.length > 0,
    placeholders: uniquePlaceholders,
  }
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

export interface CreateTicketConfig {
  projectId?: string
}

export type HalFetchJson = (
  path: string,
  body: unknown,
  opts?: { timeoutMs?: number; progressMessage?: string }
) => Promise<{ ok: boolean; json: any }>

export type IsAbortError = (err: unknown, signal?: AbortSignal) => boolean

/**
 * Core logic for creating a ticket via the HAL API.
 */
export async function createTicketLogic(
  input: CreateTicketInput,
  config: CreateTicketConfig,
  halFetchJson: HalFetchJson,
  toolCalls: ToolCallRecord[],
  isAbortError: IsAbortError
): Promise<CreateTicketResult> {
  let bodyMdTrimmed = input.body_md.trim()
  const validation = validatePlaceholders(bodyMdTrimmed)
  
  if (validation.hasPlaceholders) {
    const out: CreateTicketResult = {
      success: false,
      error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${validation.placeholders.join(', ')}.`,
      detectedPlaceholders: validation.placeholders,
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
    const out: CreateTicketResult = {
      success: false,
      error: created?.error || 'Failed to create ticket',
    }
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

  const out: CreateTicketResult = {
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

  toolCalls.push({ name: 'create_ticket', input, output: out })
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
 * Core logic for updating a ticket's body via the HAL API.
 */
export async function updateTicketBodyLogic(
  input: UpdateTicketBodyInput,
  halFetchJson: HalFetchJson,
  toolCalls: ToolCallRecord[],
  isAbortError: IsAbortError
): Promise<UpdateTicketBodyResult> {
  let bodyMdTrimmed = input.body_md.trim()
  const validation = validatePlaceholders(bodyMdTrimmed)
  
  if (validation.hasPlaceholders) {
    const out: UpdateTicketBodyResult = {
      success: false,
      error: `Ticket update rejected: unresolved template placeholder tokens detected. Detected placeholders: ${validation.placeholders.join(', ')}.`,
      detectedPlaceholders: validation.placeholders,
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
    const out: UpdateTicketBodyResult = {
      success: false,
      error: fetched?.error || `Ticket ${input.ticket_id} not found.`,
    }
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
    const out: UpdateTicketBodyResult = {
      success: false,
      error: updated?.error || 'Failed to update ticket',
    }
    toolCalls.push({ name: 'update_ticket_body', input, output: out })
    return out
  }

  const readiness = evaluateTicketReady(normalizedBodyMd)
  const out: UpdateTicketBodyResult = {
    success: true,
    ticketId: displayId,
    ready: readiness.ready,
    ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
  }
  
  toolCalls.push({ name: 'update_ticket_body', input, output: out })
  return out
}

export interface CreateRedDocumentInput {
  ticket_id: string
  red_json_content: string
}

export type CreateRedDocumentResult =
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

/**
 * Core logic for creating a RED document via the HAL API.
 * Implements idempotency: if a RED already exists, reuses it instead of creating a new version.
 */
export async function createRedDocumentLogic(
  input: CreateRedDocumentInput,
  halFetchJson: HalFetchJson,
  toolCalls: ToolCallRecord[],
  isAbortError: IsAbortError
): Promise<CreateRedDocumentResult> {
  // Fetch ticket to get ticketPk and repoFullName
  const { json: fetched } = await halFetchJson(
    '/api/tickets/get',
    { ticketId: input.ticket_id },
    { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id} for RED…` }
  )
  
  if (!fetched?.success || !fetched?.ticket) {
    const out: CreateRedDocumentResult = {
      success: false,
      error: fetched?.error || `Ticket ${input.ticket_id} not found.`,
    }
    toolCalls.push({ name: 'create_red_document_v2', input, output: out })
    return out
  }

  const ticket = fetched.ticket as any
  const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
  const repoFullName = typeof ticket.repo_full_name === 'string' ? ticket.repo_full_name : undefined

  if (!ticketPk || !repoFullName) {
    const out: CreateRedDocumentResult = {
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
    
    const out: CreateRedDocumentResult = {
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
    const out: CreateRedDocumentResult = {
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
    const out: CreateRedDocumentResult = {
      success: false,
      error: created?.error || 'Failed to create RED document',
    }
    toolCalls.push({ name: 'create_red_document_v2', input, output: out })
    return out
  }

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
  
  const out: CreateRedDocumentResult = {
    success: true,
    red_document: {
      red_id: created.red_document.red_id,
      version: created.red_document.version,
      ticket_pk: ticketPk,
      repo_full_name: repoFullName,
    },
  }
  
  toolCalls.push({ name: 'create_red_document_v2', input, output: out })
  return out
}

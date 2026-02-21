/**
 * Helper functions for PM agent tools.
 * Extracted to improve maintainability and testability.
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

/**
 * Validates that ticket body does not contain unresolved placeholders.
 * Returns unique placeholder tokens if found, empty array otherwise.
 */
export function validateNoPlaceholders(bodyMd: string): string[] {
  const placeholders = bodyMd.trim().match(PLACEHOLDER_RE) ?? []
  return [...new Set(placeholders)]
}

/**
 * Creates error result for placeholder validation failure.
 */
export function createPlaceholderError(placeholders: string[]): {
  success: false
  error: string
  detectedPlaceholders: string[]
} {
  return {
    success: false,
    error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${placeholders.join(', ')}.`,
    detectedPlaceholders: placeholders,
  }
}

/**
 * Processes ticket body for creation/update: trims, normalizes, and validates.
 */
export function processTicketBody(
  bodyMd: string,
  displayId?: string
): {
  normalized: string
  placeholders: string[]
} {
  let bodyMdTrimmed = bodyMd.trim()
  const placeholders = validateNoPlaceholders(bodyMdTrimmed)
  bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)
  if (displayId) {
    bodyMdTrimmed = normalizeTitleLineInBody(bodyMdTrimmed, displayId)
  }
  return {
    normalized: bodyMdTrimmed,
    placeholders,
  }
}

/**
 * Formats ticket creation result with metadata.
 */
export function formatTicketCreationResult(
  created: { ticketId: string; pk?: string },
  input: { title: string },
  repoFullName: string,
  normalizedBodyMd: string
): {
  id: string
  display_id: string
  ticket_number?: number
  repo_full_name: string
  filename: string
  filePath: string
  ready: boolean
  missingItems?: string[]
} {
  const displayId = String(created.ticketId)
  const ticketNumber = parseTicketNumber(displayId)
  const id = String(ticketNumber ?? 0).padStart(4, '0')
  const filename = `${id}-${slugFromTitle(input.title)}.md`
  const filePath = `supabase:tickets/${displayId}`
  const readiness = evaluateTicketReady(normalizedBodyMd)

  return {
    id,
    display_id: displayId,
    ...(typeof ticketNumber === 'number' ? { ticket_number: ticketNumber } : {}),
    repo_full_name: repoFullName,
    filename,
    filePath,
    ready: readiness.ready,
    ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
  }
}

/**
 * Gets repository full name from config, with fallback.
 */
export function getRepoFullName(projectId?: string): string {
  return typeof projectId === 'string' && projectId.trim()
    ? projectId.trim()
    : 'beardedphil/portfolio-2026-hal'
}

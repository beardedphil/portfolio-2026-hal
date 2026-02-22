/**
 * Helper functions for PM agent tool execution.
 * Extracted to improve testability and reduce complexity in projectManager.ts
 */

import { PLACEHOLDER_RE } from '../../lib/projectManagerHelpers.js'
import { parseTicketNumber } from '../../lib/projectManagerHelpers.js'

/**
 * Validates that ticket body does not contain unresolved placeholders.
 * Returns unique placeholder tokens if found, empty array if valid.
 */
export function validateNoPlaceholders(bodyMd: string): string[] {
  const trimmed = bodyMd.trim()
  const placeholders = trimmed.match(PLACEHOLDER_RE) ?? []
  return [...new Set(placeholders)]
}

/**
 * Normalizes ticket ID to 4-digit format.
 * Handles various input formats: "HAL-0012", "0012", "12", etc.
 */
export function normalizeTicketId(ticketId: string): string {
  const ticketNumber = parseTicketNumber(ticketId)
  return String(ticketNumber ?? 0).padStart(4, '0')
}

/**
 * Determines repository full name from config, with fallback.
 */
export function getRepoFullName(projectId: string | undefined): string {
  return typeof projectId === 'string' && projectId.trim()
    ? projectId.trim()
    : 'beardedphil/portfolio-2026-hal'
}

/**
 * Parses JSON response text, handling errors gracefully.
 * Returns parsed JSON or error object.
 */
export function parseJsonResponse(
  text: string,
  path: string,
  status: number,
  contentType: string | null
): { success: boolean; json: any; error?: string } {
  if (!text) {
    return { success: true, json: {} }
  }

  try {
    const json = JSON.parse(text)
    return { success: true, json }
  } catch (e) {
    const prefix = text.slice(0, 200)
    return {
      success: false,
      json: {
        success: false,
        error: `Non-JSON response from ${path} (HTTP ${status}, content-type: ${contentType || 'unknown'}): ${prefix}`,
      },
      error: `Non-JSON response from ${path}`,
    }
  }
}

/**
 * Helper functions for ticket validation and processing.
 * Extracted from projectManager.ts to improve testability and maintainability.
 */

import { PLACEHOLDER_RE } from '../../lib/projectManagerHelpers.js'

/**
 * Validates that ticket body does not contain unresolved placeholders.
 * @param bodyMd - The ticket body markdown
 * @returns Object with validation result and detected placeholders
 */
export function validateTicketPlaceholders(bodyMd: string): {
  valid: boolean
  placeholders: string[]
} {
  const trimmed = bodyMd.trim()
  const placeholders = trimmed.match(PLACEHOLDER_RE) ?? []
  const uniquePlaceholders = [...new Set(placeholders)]
  
  return {
    valid: uniquePlaceholders.length === 0,
    placeholders: uniquePlaceholders,
  }
}

/**
 * Creates an error response for placeholder validation failure.
 * @param placeholders - Array of detected placeholder strings
 * @returns Error response object
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
 * Parses HAL API response text, handling non-JSON responses gracefully.
 * @param text - Response text from HAL API
 * @param path - API path (for error messages)
 * @param status - HTTP status code
 * @param contentType - Content-Type header value
 * @returns Parsed JSON object or error object
 */
export function parseHalResponse(
  text: string,
  path: string,
  status: number,
  contentType: string | null
): any {
  if (!text) {
    return {}
  }
  
  try {
    return JSON.parse(text)
  } catch (e) {
    const prefix = text.slice(0, 200)
    return {
      success: false,
      error: `Non-JSON response from ${path} (HTTP ${status}, content-type: ${contentType || 'unknown'}): ${prefix}`,
    }
  }
}

/**
 * Determines the repository full name from config, with fallback.
 * @param projectId - Project ID from config (may be repo full name)
 * @param defaultRepo - Default repository full name
 * @returns Repository full name
 */
export function getRepoFullName(projectId: unknown, defaultRepo: string): string {
  if (typeof projectId === 'string' && projectId.trim()) {
    return projectId.trim()
  }
  return defaultRepo
}

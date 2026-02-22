/**
 * Helper functions for artifact processing in get.ts
 * Extracted to improve testability and maintainability.
 */

/**
 * Determines if an artifact body is blank (empty or placeholder content).
 * 
 * @param body_md - The markdown body content
 * @param title - The artifact title (for context)
 * @returns true if the artifact is considered blank
 */
export function isArtifactBlank(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }

  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*+]\s+.*$/gm, '')
    .replace(/^\d+\.\s+.*$/gm, '')
    .trim()

  if (withoutHeadings.length === 0 || withoutHeadings.length < 30) {
    return true
  }

  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m,
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return true
    }
  }

  return false
}

/**
 * Extracts a snippet from markdown content (first ~200 chars, word-boundary aware).
 * 
 * @param body_md - The markdown body content
 * @returns A snippet string (max ~200 chars, with ellipsis if truncated)
 */
export function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  const withoutHeadings = body_md.replace(/^#{1,6}\s+.*$/gm, '').trim()
  if (withoutHeadings.length === 0) {
    return ''
  }

  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  if (lastSpace > 150 && lastSpace < 200) {
    return snippet.substring(0, lastSpace) + '...'
  }

  return snippet.length < withoutHeadings.length ? snippet + '...' : snippet
}

/**
 * Validates if a ticket ID is numeric and can be parsed.
 * 
 * @param ticketId - The ticket ID string
 * @returns The parsed ticket number, or null if invalid
 */
export function parseTicketNumber(ticketId: string): number | null {
  if (!ticketId || ticketId.trim().length === 0) {
    return null
  }
  // Check if string contains only digits (no decimal points, no letters)
  if (!/^\d+$/.test(ticketId.trim())) {
    return null
  }
  const ticketNumber = parseInt(ticketId.trim(), 10)
  return Number.isFinite(ticketNumber) ? ticketNumber : null
}

/**
 * Checks if an error is retryable (network/timeout errors).
 * 
 * @param error - The error object
 * @returns true if the error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false
  const message = error.message?.toLowerCase() || ''
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    error.code === 'PGRST116' // PostgREST connection error
  )
}

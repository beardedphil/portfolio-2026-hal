/**
 * Helper functions for ticket ID formatting and extraction
 * Extracted from src/App.tsx to reduce complexity and improve testability
 */

/**
 * Format ticket ID as HAL-XXXX
 * @param ticketId - The ticket ID (e.g., "711" or "0711")
 * @returns Formatted ticket ID (e.g., "HAL-0711") or "No ticket" if null
 */
export function formatTicketId(ticketId: string | null): string {
  if (!ticketId) return 'No ticket'
  // Ensure ticket ID is 4 digits, pad with zeros if needed
  const padded = ticketId.padStart(4, '0')
  return `HAL-${padded}`
}

/**
 * Extract ticket ID from message content
 * @param content - The message content to search
 * @returns The ticket ID (4 digits) if found, or null
 */
export function extractTicketId(content: string): string | null {
  // Try "Implement ticket XXXX" or "QA ticket XXXX" patterns
  const implMatch = content.match(/implement\s+ticket\s+(\d{4})/i)
  if (implMatch) return implMatch[1]
  const qaMatch = content.match(/qa\s+ticket\s+(\d{4})/i)
  if (qaMatch) return qaMatch[1]
  // Try to find any 4-digit ticket ID in the message
  const anyMatch = content.match(/\b(\d{4})\b/)
  if (anyMatch) return anyMatch[1]
  return null
}

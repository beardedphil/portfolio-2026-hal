/**
 * Pure helper for ticket ID resolution strategies.
 * 
 * Given a ticketId (not ticketPk), this function returns an ordered list of lookup attempts
 * that match the multi-strategy resolution behavior used by /api/tickets/move.
 * 
 * The strategies are:
 * 1. Try by id field as-is (e.g., "172")
 * 2. Try by display_id (e.g., "HAL-0172")
 * 3. If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id (removing leading zeros)
 * 4. If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
 */

export type TicketLookupStrategy = 
  | { type: 'id'; value: string }
  | { type: 'display_id'; value: string }

export interface TicketLookupAttempt {
  strategy: TicketLookupStrategy
  description: string
}

/**
 * Generates an ordered list of lookup attempts for a given ticketId.
 * Returns an empty array if ticketId is not provided.
 * 
 * @param ticketId - The ticket ID to resolve (numeric, zero-padded, or display ID like HAL-0172)
 * @returns Ordered list of lookup attempts to try
 */
export function generateTicketLookupAttempts(ticketId?: string): TicketLookupAttempt[] {
  if (!ticketId) {
    return []
  }

  const attempts: TicketLookupAttempt[] = []

  // Strategy 1: Try by id field as-is (e.g., "172")
  attempts.push({
    strategy: { type: 'id', value: ticketId },
    description: `Try by id field as-is: "${ticketId}"`,
  })

  // Strategy 2: Try by display_id (e.g., "HAL-0172")
  attempts.push({
    strategy: { type: 'display_id', value: ticketId },
    description: `Try by display_id: "${ticketId}"`,
  })

  // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
  if (/^[A-Z]+-/.test(ticketId)) {
    const numericPart = ticketId.replace(/^[A-Z]+-/, '')
    // Remove leading zeros to get the actual id value (e.g., "0172" -> "172")
    // If all zeros are removed, use "0" instead of empty string
    const idValue = numericPart.replace(/^0+/, '') || '0'
    if (idValue !== ticketId) {
      attempts.push({
        strategy: { type: 'id', value: idValue },
        description: `Extract numeric part from display_id "${ticketId}" and try by id: "${idValue}"`,
      })
    }
  }

  // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
  if (/^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
    // Remove leading zeros. If all zeros are removed, use "0" instead of empty string
    const withoutLeadingZeros = ticketId.replace(/^0+/, '') || '0'
    if (withoutLeadingZeros !== ticketId) {
      attempts.push({
        strategy: { type: 'id', value: withoutLeadingZeros },
        description: `Remove leading zeros from "${ticketId}" and try by id: "${withoutLeadingZeros}"`,
      })
    }
  }

  return attempts
}

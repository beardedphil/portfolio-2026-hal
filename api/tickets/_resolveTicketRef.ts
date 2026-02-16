/**
 * Ticket ID resolution helper.
 * Extracts the multi-strategy resolution plan used by /api/tickets/move.
 * 
 * This pure function returns an array of lookup attempts that should be tried
 * in order to resolve a ticket by its ID. The actual database lookups are
 * performed by the caller using these attempts.
 * 
 * Strategies:
 * 1. Try by id field as-is (e.g., "172") - only for numeric IDs
 * 2. Try by display_id (e.g., "HAL-0172")
 * 3. If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id (with leading zeros stripped)
 * 4. If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
 */

export type TicketLookupAttempt = {
  type: 'id' | 'display_id'
  value: string
}

/**
 * Returns an array of lookup attempts for resolving a ticket by ID.
 * The attempts should be tried in order until one succeeds.
 * 
 * @param ticketId - The ticket ID to resolve (can be numeric, zero-padded, or display ID like HAL-0172)
 * @returns Array of lookup attempts, or empty array if ticketId is invalid
 */
export function resolveTicketRef(ticketId: string | undefined): TicketLookupAttempt[] {
  if (!ticketId) return []
  
  const trimmed = ticketId.trim()
  if (!trimmed) return []
  
  const attempts: TicketLookupAttempt[] = []
  const isNumeric = /^\d+$/.test(trimmed)
  const isDisplayIdFormat = /^[A-Z]+-/.test(trimmed)
  
  // Strategy 1: Try by id field as-is (only for numeric ticketIds, e.g., "172")
  if (isNumeric) {
    attempts.push({ type: 'id', value: trimmed })
  }
  
  // Strategy 2: Try by display_id (e.g., "HAL-0172")
  attempts.push({ type: 'display_id', value: trimmed })
  
  // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
  if (isDisplayIdFormat) {
    const numericPart = trimmed.replace(/^[A-Z]+-/, '')
    // Remove leading zeros to get the actual id value (e.g., "0172" -> "172")
    // If all zeros, keep "0" (not empty string)
    const idValue = numericPart.replace(/^0+/, '') || '0'
    // Only add if it's different from what we'd get from Strategy 1 (to avoid duplicates)
    if (!isNumeric || idValue !== trimmed) {
      attempts.push({ type: 'id', value: idValue })
    }
  }
  
  // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
  if (isNumeric && trimmed.startsWith('0')) {
    // If all zeros, keep "0" (not empty string)
    const withoutLeadingZeros = trimmed.replace(/^0+/, '') || '0'
    // Only add if it's different from the original (to avoid duplicates)
    if (withoutLeadingZeros !== trimmed) {
      attempts.push({ type: 'id', value: withoutLeadingZeros })
    }
  }
  
  return attempts
}

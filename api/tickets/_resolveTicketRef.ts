/**
 * Ticket reference resolution helper.
 * 
 * Generates a list of lookup strategies for resolving a ticket reference
 * (ticketId) to a ticket record. The strategies are ordered by preference:
 * 1. Direct id lookup
 * 2. display_id lookup
 * 3. Extract numeric from display_id format and lookup by id
 * 4. Strip leading zeros from numeric string and lookup by id
 * 
 * This module provides a pure function that generates the resolution plan,
 * which can then be executed by the caller using their Supabase client.
 */

export type TicketLookupStrategy = {
  type: 'id' | 'display_id'
  value: string
}

/**
 * Generates lookup strategies for resolving a ticket reference.
 * 
 * @param ticketId - The ticket ID to resolve (e.g., "172", "0172", "HAL-0172")
 * @returns Array of lookup strategies to try in order, or null if ticketId is empty
 * 
 * @example
 * // Numeric ID
 * resolveTicketRefStrategies("172")
 * // Returns: [{ type: 'id', value: '172' }, { type: 'display_id', value: '172' }]
 * 
 * @example
 * // Display ID format
 * resolveTicketRefStrategies("HAL-0172")
 * // Returns: [
 * //   { type: 'id', value: 'HAL-0172' },
 * //   { type: 'display_id', value: 'HAL-0172' },
 * //   { type: 'id', value: '172' }
 * // ]
 * 
 * @example
 * // Numeric with leading zeros
 * resolveTicketRefStrategies("0172")
 * // Returns: [
 * //   { type: 'id', value: '0172' },
 * //   { type: 'display_id', value: '0172' },
 * //   { type: 'id', value: '172' }
 * // ]
 */
export function resolveTicketRefStrategies(ticketId: string | undefined | null): TicketLookupStrategy[] | null {
  if (!ticketId || !ticketId.trim()) {
    return null
  }

  const trimmed = ticketId.trim()
  const strategies: TicketLookupStrategy[] = []

  // Strategy 1: Try by id field as-is (e.g., "172", "0172", "HAL-0172")
  strategies.push({ type: 'id', value: trimmed })

  // Strategy 2: Try by display_id (e.g., "HAL-0172")
  strategies.push({ type: 'display_id', value: trimmed })

  // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
  if (/^[A-Z]+-/.test(trimmed)) {
    const numericPart = trimmed.replace(/^[A-Z]+-/, '')
    // Remove leading zeros to get the actual id value (e.g., "0172" -> "172")
    const idValue = numericPart.replace(/^0+/, '') || numericPart
    if (idValue !== trimmed) {
      strategies.push({ type: 'id', value: idValue })
    }
  }

  // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
  if (/^\d+$/.test(trimmed) && trimmed.startsWith('0')) {
    const withoutLeadingZeros = trimmed.replace(/^0+/, '') || trimmed
    if (withoutLeadingZeros !== trimmed) {
      strategies.push({ type: 'id', value: withoutLeadingZeros })
    }
  }

  return strategies
}

/**
 * Shared ticket lookup logic.
 * Extracted from insert-implementation.ts and insert-qa.ts to reduce duplication.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TicketInfo {
  pk: string
  repo_full_name: string | null
  display_id: string | null
}

/**
 * Validates that ticketId is a numeric ID.
 */
export function validateTicketId(ticketId: string | undefined): { valid: boolean; error?: string } {
  if (!ticketId) {
    return { valid: false, error: 'ticketId is required.' }
  }

  const ticketNumber = parseInt(ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return {
      valid: false,
      error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
    }
  }

  return { valid: true }
}

/**
 * Looks up ticket by ticket_number (repo-scoped) or id (legacy).
 * Returns ticket info including pk, repo_full_name, and display_id.
 */
export async function lookupTicket(
  supabase: SupabaseClient,
  ticketId: string
): Promise<{ ticket: TicketInfo | null; error: string | null }> {
  const ticketNumber = parseInt(ticketId, 10)
  
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, display_id')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
    .maybeSingle()

  if (ticketError) {
    return { ticket: null, error: ticketError.message }
  }

  if (!ticket) {
    return { ticket: null, error: `Ticket ${ticketId} not found in Supabase.` }
  }

  return {
    ticket: {
      pk: ticket.pk,
      repo_full_name: ticket.repo_full_name,
      display_id: ticket.display_id,
    },
    error: null,
  }
}

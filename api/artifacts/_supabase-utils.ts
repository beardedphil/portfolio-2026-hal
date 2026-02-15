/**
 * Shared Supabase utilities for artifact endpoints.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TicketInfo {
  pk: string
  repo_full_name: string
  display_id?: string
}

/**
 * Creates Supabase client from credentials.
 */
export function createSupabaseClient(
  supabaseUrl: string,
  supabaseAnonKey: string
): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey)
}

/**
 * Validates ticket ID format (must be numeric).
 */
export function validateTicketId(ticketId: string): { valid: boolean; error?: string } {
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
 * Looks up ticket by ID (supports both ticket_number and legacy id).
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
    return { ticket: null, error: `Failed to query ticket: ${ticketError.message}` }
  }

  if (!ticket) {
    return { ticket: null, error: `Ticket ${ticketId} not found in Supabase.` }
  }

  return { ticket: ticket as TicketInfo, error: null }
}

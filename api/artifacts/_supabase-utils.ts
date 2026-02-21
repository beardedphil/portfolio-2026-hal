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
  const ref = ticketId.trim()
  if (!ref) {
    return { valid: false, error: 'ticketId is required.' }
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (UUID_RE.test(ref)) return { valid: true }
  if (/^\d+$/.test(ref)) return { valid: true }
  if (/^[A-Za-z]+-\d+$/.test(ref)) return { valid: true }

  const match = ref.match(/(\d+)/)
  if (match) {
    const n = parseInt(match[1], 10)
    if (Number.isFinite(n)) return { valid: true }
  }

  return {
    valid: false,
    error: `Invalid ticket ID: ${ticketId}. Expected numeric ID, display ID (e.g. HAL-0713), or ticket pk UUID.`,
  }
}

/**
 * Looks up ticket by ID (supports both ticket_number and legacy id).
 */
export async function lookupTicket(
  supabase: SupabaseClient,
  ticketId: string
): Promise<{ ticket: TicketInfo | null; error: string | null }> {
  const ref = ticketId.trim()
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  const baseQuery = () => supabase.from('tickets').select('pk, repo_full_name, display_id')

  if (UUID_RE.test(ref)) {
    const { data: byPk, error: byPkErr } = await baseQuery().eq('pk', ref).maybeSingle()
    if (byPkErr) return { ticket: null, error: `Failed to query ticket: ${byPkErr.message}` }
    if (byPk) return { ticket: byPk as TicketInfo, error: null }
  }

  const { data: byDisplay, error: byDisplayErr } = await baseQuery()
    .eq('display_id', ref)
    .maybeSingle()
  if (byDisplayErr) return { ticket: null, error: `Failed to query ticket: ${byDisplayErr.message}` }
  if (byDisplay) return { ticket: byDisplay as TicketInfo, error: null }

  const match = ref.match(/(\d+)/)
  const n = match ? parseInt(match[1], 10) : NaN
  if (Number.isFinite(n)) {
    const { data: byTicketNumber, error: byTicketNumberErr } = await baseQuery()
      .eq('ticket_number', n)
      .maybeSingle()
    if (byTicketNumberErr)
      return { ticket: null, error: `Failed to query ticket: ${byTicketNumberErr.message}` }
    if (byTicketNumber) return { ticket: byTicketNumber as TicketInfo, error: null }

    const { data: byLegacyId, error: byLegacyIdErr } = await baseQuery()
      .eq('id', String(n))
      .maybeSingle()
    if (byLegacyIdErr)
      return { ticket: null, error: `Failed to query ticket: ${byLegacyIdErr.message}` }
    if (byLegacyId) return { ticket: byLegacyId as TicketInfo, error: null }
  }

  return { ticket: null, error: `Ticket ${ticketId} not found in Supabase.` }
}

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function extractTicketNumber(ticketRef: string): number | null {
  const match = ticketRef.match(/(\d+)/)
  if (!match) return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Validates that ticketId is a supported reference:
 * - numeric (`713`, `0713`)
 * - display id (`HAL-0713`)
 * - ticket pk UUID
 */
export function validateTicketId(ticketId: string | undefined): { valid: boolean; error?: string } {
  if (!ticketId) {
    return { valid: false, error: 'ticketId is required.' }
  }

  const ref = ticketId.trim()
  if (!ref) {
    return { valid: false, error: 'ticketId is required.' }
  }

  if (ref.length > 128) {
    return {
      valid: false,
      error: `Invalid ticket ID: ${ticketId}. Value is too long.`,
    }
  }

  if (UUID_RE.test(ref)) return { valid: true }
  if (/^\d+$/.test(ref)) return { valid: true }
  if (/^[A-Za-z]+-\d+$/.test(ref)) return { valid: true }

  const ticketNumber = extractTicketNumber(ref)
  if (ticketNumber !== null) return { valid: true }

  return {
    valid: false,
    error: `Invalid ticket ID: ${ticketId}. Expected numeric ID, display ID (e.g. HAL-0713), or ticket pk UUID.`,
  }
}

/**
 * Looks up ticket by pk UUID, display_id, ticket_number (repo-scoped), or legacy id.
 * Returns ticket info including pk, repo_full_name, and display_id.
 */
export async function lookupTicket(
  supabase: SupabaseClient,
  ticketId: string
): Promise<{ ticket: TicketInfo | null; error: string | null }> {
  const ref = ticketId.trim()

  const baseQuery = () => supabase.from('tickets').select('pk, repo_full_name, display_id')

  // 1) pk UUID (canonical internal identifier)
  if (UUID_RE.test(ref)) {
    const { data: byPk, error: byPkErr } = await baseQuery().eq('pk', ref).maybeSingle()
    if (byPkErr) return { ticket: null, error: byPkErr.message }
    if (byPk) return { ticket: byPk as TicketInfo, error: null }
  }

  // 2) display_id (e.g. HAL-0713)
  const { data: byDisplay, error: byDisplayErr } = await baseQuery()
    .eq('display_id', ref)
    .maybeSingle()
  if (byDisplayErr) return { ticket: null, error: byDisplayErr.message }
  if (byDisplay) return { ticket: byDisplay as TicketInfo, error: null }

  // 3) ticket_number / legacy id (numeric)
  const ticketNumber = extractTicketNumber(ref)
  if (ticketNumber !== null) {
    const { data: byTicketNumber, error: byTicketNumberErr } = await baseQuery()
      .eq('ticket_number', ticketNumber)
      .maybeSingle()
    if (byTicketNumberErr) return { ticket: null, error: byTicketNumberErr.message }
    if (byTicketNumber) return { ticket: byTicketNumber as TicketInfo, error: null }

    const { data: byLegacyId, error: byLegacyIdErr } = await baseQuery()
      .eq('id', String(ticketNumber))
      .maybeSingle()
    if (byLegacyIdErr) return { ticket: null, error: byLegacyIdErr.message }
    if (byLegacyId) return { ticket: byLegacyId as TicketInfo, error: null }
  }

  return { ticket: null, error: `Ticket ${ticketId} not found in Supabase.` }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { stripQABlocksFromTicketBody } from '../../_lib/strip-qa-from-ticket-body.js'

export interface UpdateTicketBodyParams {
  ticketId: string
  body_md: string
}

export interface UpdateTicketBodyResult {
  success: boolean
  ticketId?: string
  error?: string
}

/**
 * Updates a ticket's body_md in Supabase.
 * Strips QA blocks before storing (QA is artifacts only).
 */
export async function updateTicketBody(
  supabase: SupabaseClient,
  params: UpdateTicketBodyParams
): Promise<UpdateTicketBodyResult> {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, id, display_id')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError || !ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found in Supabase.` }
  }

  // Never persist QA Information / Implementation artifacts blocks; QA is artifacts only
  const bodyToStore = stripQABlocksFromTicketBody(params.body_md)
  const ticketPk = (ticket as { pk?: string }).pk
  const updateQ = supabase.from('tickets').update({ body_md: bodyToStore })
  const { error: updateError } = ticketPk
    ? await updateQ.eq('pk', ticketPk)
    : await updateQ.eq('id', params.ticketId)

  if (updateError) {
    return { success: false, error: `Supabase update failed: ${updateError.message}` }
  }

  return { success: true, ticketId: params.ticketId }
}

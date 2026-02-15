import type { SupabaseClient } from '@supabase/supabase-js'

export interface GetTicketContentParams {
  ticketId: string
}

export interface GetTicketContentResult {
  success: boolean
  ticket?: any
  artifacts?: any[]
  artifacts_error?: string
  body_md?: string
  error?: string
}

/**
 * Gets a ticket's full content including body_md and artifacts.
 * Returns full ticket record for forward compatibility.
 */
export async function getTicketContent(
  supabase: SupabaseClient,
  params: GetTicketContentParams
): Promise<GetTicketContentResult> {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  // Select all fields for forward compatibility
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError) {
    return { success: false, error: `Supabase fetch failed: ${ticketError.message}` }
  }

  if (!ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found.` }
  }

  // Fetch artifacts for this ticket
  let artifacts: any[] = []
  let artifactsError: string | null = null
  const ticketPk = ticket.pk
  if (ticketPk) {
    try {
      const { data: artifactsData, error: artifactsErr } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
        .eq('ticket_pk', ticketPk)
        .order('created_at', { ascending: false })

      if (artifactsErr) {
        artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
      } else {
        artifacts = artifactsData || []
      }
    } catch (err) {
      artifactsError = err instanceof Error ? err.message : String(err)
    }
  }

  // Return full ticket record with artifacts
  // Forward-compatible: return all ticket fields
  return {
    success: true,
    ticket: ticket, // Full ticket record (all fields)
    artifacts: artifacts, // Array of artifacts
    ...(artifactsError ? { artifacts_error: artifactsError } : {}), // Include error if artifacts fetch failed
    // Backward compatibility: also include body_md at top level
    body_md: ticket.body_md || '',
  }
}

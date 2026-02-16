/**
 * Supabase data fetching functions extracted from App.tsx
 * These functions handle fetching tickets, artifacts, attachments, and agent runs from Supabase.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseTicketRow, SupabaseAgentArtifactRow, SupabaseAgentRunRow, TicketAttachment } from '../App.types'
import { normalizeTicketRow } from './normalizeTicketRow'

/**
 * Creates a Supabase client with the given URL and key.
 * Returns null if URL or key is missing.
 */
export function createSupabaseClient(url: string, key: string): SupabaseClient | null {
  const u = url?.trim()
  const k = key?.trim()
  if (!u || !k) {
    return null
  }
  return createClient(u, k)
}

/**
 * Fetches tickets from Supabase for a specific repository.
 * Returns normalized ticket rows or empty array on error.
 */
export async function fetchTickets(
  client: SupabaseClient,
  repoFullName: string | null
): Promise<SupabaseTicketRow[]> {
  try {
    if (!repoFullName) {
      // No repo connected: return empty array (repo-scoped 0079)
      return []
    }

    const { data, error } = await client
      .from('tickets')
      .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
      .eq('repo_full_name', repoFullName)
      .order('ticket_number', { ascending: true })

    if (error) {
      console.warn('Failed to fetch tickets:', error)
      return []
    }

    return ((data ?? []) as any[]).map((r) => normalizeTicketRow(r))
  } catch (e) {
    console.warn('Failed to fetch tickets:', e)
    return []
  }
}

/**
 * Fetches artifacts for a specific ticket.
 * Returns empty array on error.
 */
export async function fetchTicketArtifacts(
  client: SupabaseClient,
  ticketPk: string
): Promise<SupabaseAgentArtifactRow[]> {
  try {
    const { data, error } = await client
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: true })
      .order('artifact_id', { ascending: true })

    if (error) {
      console.warn('Failed to fetch artifacts:', error)
      return []
    }

    return (data ?? []) as SupabaseAgentArtifactRow[]
  } catch (e) {
    console.warn('Failed to fetch artifacts:', e)
    return []
  }
}

/**
 * Fetches ticket attachments for a specific ticket ID.
 * Returns empty array on error.
 */
export async function fetchTicketAttachments(
  client: SupabaseClient,
  ticketId: string
): Promise<TicketAttachment[]> {
  try {
    const { data, error } = await client
      .from('ticket_attachments')
      .select('pk, ticket_pk, ticket_id, filename, mime_type, data_url, file_size, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Failed to fetch ticket attachments:', error)
      return []
    }

    return (data ?? []) as TicketAttachment[]
  } catch (e) {
    console.warn('Failed to fetch ticket attachments:', e)
    return []
  }
}

/**
 * Fetches active agent runs for tickets in the Doing column.
 * Returns a map of ticket PK to the most recent active run.
 */
export async function fetchActiveAgentRuns(
  client: SupabaseClient,
  repoFullName: string,
  ticketPks: string[]
): Promise<Record<string, SupabaseAgentRunRow>> {
  try {
    if (ticketPks.length === 0) {
      return {}
    }

    // Fetch active agent runs (status not 'completed' or 'failed') for these tickets
    const { data, error } = await client
      .from('hal_agent_runs')
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, status, current_stage, created_at, updated_at')
      .eq('repo_full_name', repoFullName)
      .in('ticket_pk', ticketPks)
      // Filter for active runs: any status that's not 'completed' or 'failed'
      .in('status', ['preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch', 'launching', 'running', 'reviewing', 'polling', 'generating_report', 'merging', 'moving_ticket', 'created', 'finished'])
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Failed to fetch agent runs:', error)
      return {}
    }

    // Map by ticket_pk, keeping only the most recent active run per ticket
    const runsByTicket: Record<string, SupabaseAgentRunRow> = {}
    for (const run of (data ?? []) as SupabaseAgentRunRow[]) {
      if (run.ticket_pk && (!runsByTicket[run.ticket_pk] || new Date(run.created_at) > new Date(runsByTicket[run.ticket_pk].created_at))) {
        runsByTicket[run.ticket_pk] = run
      }
    }

    return runsByTicket
  } catch (e) {
    console.warn('Failed to fetch agent runs:', e)
    return {}
  }
}

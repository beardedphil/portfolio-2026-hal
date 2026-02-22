import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole, fetchTicketByPkOrId } from '../tickets/_shared.js'
import { parseAcceptanceCriteria } from '../tickets/_acceptance-criteria-parser.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket to get body_md and repo_full_name
    const ticketFetch = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)
    if (!ticketFetch || ticketFetch.error || !ticketFetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticket = ticketFetch.data
    const ticketPkValue = ticket.pk || ticketPk

    if (!ticketPkValue) {
      json(res, 200, {
        success: false,
        error: 'Could not determine ticket PK.',
      })
      return
    }

    // Parse AC items from ticket body
    const acItems = parseAcceptanceCriteria(ticket.body_md || null)

    // Fetch existing AC status records
    const { data: acStatusRecords, error: acStatusError } = await supabase
      .from('acceptance_criteria_status')
      .select('*')
      .eq('ticket_pk', ticketPkValue)
      .order('ac_index', { ascending: true })

    if (acStatusError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch AC status: ${acStatusError.message}`,
      })
      return
    }

    // Build response: merge AC items from body with status records
    const acStatus = acItems.map((acItem, index) => {
      const statusRecord = acStatusRecords?.find((r) => r.ac_index === index)
      return {
        index: acItem.index,
        text: acItem.text,
        status: statusRecord?.status || 'unmet',
        actor_type: statusRecord?.actor_type || null,
        agent_type: statusRecord?.agent_type || null,
        justification: statusRecord?.justification || '',
        updated_at: statusRecord?.updated_at || null,
        created_at: statusRecord?.created_at || null,
      }
    })

    json(res, 200, {
      success: true,
      ac_status: acStatus,
      ticket_pk: ticketPkValue,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

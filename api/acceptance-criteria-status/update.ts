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
      acIndex: number
      status: 'met' | 'unmet'
      actorType: 'human' | 'agent'
      agentType?: string
      justification?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const acIndex = typeof body.acIndex === 'number' ? body.acIndex : undefined
    const status = body.status
    const actorType = body.actorType
    const agentType = typeof body.agentType === 'string' ? body.agentType.trim() || undefined : undefined
    const justification = typeof body.justification === 'string' ? body.justification.trim() : ''
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (acIndex === undefined || acIndex < 0) {
      json(res, 400, {
        success: false,
        error: 'acIndex is required and must be >= 0.',
      })
      return
    }

    if (status !== 'met' && status !== 'unmet') {
      json(res, 400, {
        success: false,
        error: 'status must be "met" or "unmet".',
      })
      return
    }

    if (actorType !== 'human' && actorType !== 'agent') {
      json(res, 400, {
        success: false,
        error: 'actorType must be "human" or "agent".',
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
    const repoFullName = ticket.repo_full_name

    if (!ticketPkValue) {
      json(res, 200, {
        success: false,
        error: 'Could not determine ticket PK.',
      })
      return
    }

    if (!repoFullName) {
      json(res, 200, {
        success: false,
        error: 'Ticket missing repo_full_name.',
      })
      return
    }

    // Validate AC index exists in ticket body
    const acItems = parseAcceptanceCriteria(ticket.body_md || null)
    if (acIndex >= acItems.length) {
      json(res, 200, {
        success: false,
        error: `AC index ${acIndex} is out of range. Ticket has ${acItems.length} AC items.`,
      })
      return
    }

    const acText = acItems[acIndex].text

    // Upsert AC status record
    const { data: acStatusRecord, error: upsertError } = await supabase
      .from('acceptance_criteria_status')
      .upsert(
        {
          ticket_pk: ticketPkValue,
          repo_full_name: repoFullName,
          ac_index: acIndex,
          ac_text: acText,
          status,
          actor_type: actorType,
          agent_type: actorType === 'agent' ? (agentType || 'agent') : null,
          justification,
        },
        {
          onConflict: 'ticket_pk,ac_index',
        }
      )
      .select()
      .single()

    if (upsertError) {
      json(res, 200, {
        success: false,
        error: `Failed to update AC status: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      ac_status: acStatusRecord,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

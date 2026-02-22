import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

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
      ticketPk?: string
      ticketId?: string
      transition?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
    const transition = typeof body.transition === 'string' ? body.transition.trim() : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 50

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // If ticketId provided, resolve to ticketPk
    let resolvedTicketPk = ticketPk
    if (!resolvedTicketPk && ticketId) {
      const { data: ticket, error: ticketErr } = await supabase
        .from('tickets')
        .select('pk')
        .or(`id.eq.${ticketId},display_id.eq.${ticketId},ticket_number.eq.${ticketId}`)
        .maybeSingle()

      if (ticketErr || !ticket) {
        json(res, 404, {
          success: false,
          error: `Ticket ${ticketId} not found.`,
        })
        return
      }

      resolvedTicketPk = (ticket as any).pk
    }

    if (!resolvedTicketPk) {
      json(res, 400, {
        success: false,
        error: 'Could not resolve ticket PK.',
      })
      return
    }

    // Build query
    let query = supabase
      .from('drift_attempts')
      .select('*')
      .eq('ticket_pk', resolvedTicketPk)
      .order('attempted_at', { ascending: false })
      .limit(limit)

    // Filter by transition if provided
    if (transition) {
      query = query.eq('transition', transition)
    }

    const { data: attempts, error: attemptsErr } = await query

    if (attemptsErr) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch drift attempts: ${attemptsErr.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      attempts: attempts || [],
    })
  } catch (err) {
    console.error('[api/drift-attempts/get] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

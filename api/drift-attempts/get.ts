import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole, fetchTicketByPkOrId } from '../tickets/_shared.js'

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
      transition?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const transition = typeof body.transition === 'string' ? body.transition.trim() || undefined : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 50

    // Use service role key (preferred) to bypass RLS, fall back to anon key if not available
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

    // Resolve ticket PK if only ticketId provided
    let resolvedTicketPk: string | null = null
    if (ticketPk) {
      resolvedTicketPk = ticketPk
    } else if (ticketId) {
      const ticketFetch = await fetchTicketByPkOrId(supabase, undefined, ticketId)
      if (ticketFetch?.data) {
        resolvedTicketPk = (ticketFetch.data as any).pk as string
      }
    }

    if (!resolvedTicketPk) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
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

    const { data: attempts, error } = await query

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch drift attempts: ${error.message}`,
      })
      return
    }

    // Transform data for client consumption
    const transformedAttempts = (attempts || []).map((attempt: any) => ({
      id: attempt.id,
      ticket_pk: attempt.ticket_pk,
      transition: attempt.transition,
      attempted_at: attempt.attempted_at,
      pr_url: attempt.pr_url,
      evaluated_head_sha: attempt.evaluated_head_sha,
      overall_status: attempt.overall_status,
      required_checks: attempt.required_checks,
      failing_check_names: attempt.failing_check_names,
      checks_page_url: attempt.checks_page_url,
      evaluation_error: attempt.evaluation_error,
      failure_reasons: attempt.failure_reasons || [],
      references: attempt.references || {},
      blocked: attempt.blocked,
      created_at: attempt.created_at,
      // Computed fields for UI
      passed: !attempt.blocked && attempt.overall_status === 'passing',
      failed: attempt.blocked || attempt.overall_status === 'failing' || (attempt.failure_reasons && Array.isArray(attempt.failure_reasons) && attempt.failure_reasons.length > 0),
    }))

    json(res, 200, {
      success: true,
      attempts: transformedAttempts,
      count: transformedAttempts.length,
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

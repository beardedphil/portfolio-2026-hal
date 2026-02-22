/**
 * API endpoint to list cold-start continuity check results.
 * Returns the latest result and history of prior runs.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

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
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      role?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const role = typeof body.role === 'string' ? body.role.trim() || undefined : undefined
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(100, body.limit)) : 10

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!role) {
      return json(res, 400, {
        success: false,
        error: 'role is required (e.g., "implementation-agent", "qa-agent", "project-manager").',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Resolve ticket_pk if only ticketId provided
    let resolvedTicketPk = ticketPk

    if (!resolvedTicketPk && ticketId) {
      // Try lookup by display_id first, then by id
      const byDisplayId = await supabase
        .from('tickets')
        .select('pk')
        .eq('display_id', ticketId)
        .maybeSingle()

      if (byDisplayId.error || !byDisplayId.data) {
        const byId = await supabase
          .from('tickets')
          .select('pk')
          .eq('id', ticketId)
          .maybeSingle()

        if (byId.error || !byId.data) {
          return json(res, 404, {
            success: false,
            error: `Ticket not found: ${ticketId}`,
          })
        }

        resolvedTicketPk = byId.data.pk
      } else {
        resolvedTicketPk = byDisplayId.data.pk
      }
    }

    // Fetch check results
    let query = supabase
      .from('cold_start_continuity_checks')
      .select('*')
      .eq('ticket_pk', resolvedTicketPk)
      .eq('role', role)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (repoFullName) {
      query = query.eq('repo_full_name', repoFullName)
    }

    const { data: checks, error: checksError } = await query

    if (checksError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch continuity checks: ${checksError.message}`,
      })
    }

    const latestCheck = checks && checks.length > 0 ? checks[0] : null
    const history = checks && checks.length > 0 ? checks.slice(1) : []

    return json(res, 200, {
      success: true,
      latest: latestCheck
        ? {
            runId: latestCheck.run_id,
            verdict: latestCheck.verdict,
            failureReason: latestCheck.failure_reason || undefined,
            completedAt: latestCheck.created_at,
            summary: latestCheck.summary,
            comparisonDetails: latestCheck.comparison_details,
          }
        : null,
      history: history.map((check) => ({
        runId: check.run_id,
        verdict: check.verdict,
        failureReason: check.failure_reason || undefined,
        completedAt: check.created_at,
        summary: check.summary,
      })),
    })
  } catch (err) {
    console.error('Error in list cold-start continuity checks handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

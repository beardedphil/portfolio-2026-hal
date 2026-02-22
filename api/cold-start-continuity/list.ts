/**
 * API endpoint to list cold-start continuity check results.
 * Returns history of checks for a bundle or ticket.
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
      bundleId?: string
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 10

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!bundleId && !ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'bundleId, ticketPk, or ticketId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Build query
    let query = supabase
      .from('cold_start_continuity_checks')
      .select('*')
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (bundleId) {
      query = query.eq('bundle_id', bundleId)
    } else if (ticketPk) {
      query = query.eq('ticket_pk', ticketPk)
      if (repoFullName) {
        query = query.eq('repo_full_name', repoFullName)
      }
    } else if (ticketId) {
      query = query.eq('ticket_id', ticketId)
      if (repoFullName) {
        query = query.eq('repo_full_name', repoFullName)
      }
    }

    const { data: checks, error: checksError } = await query

    if (checksError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch continuity checks: ${checksError.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      checks: (checks || []).map((check) => ({
        runId: check.run_id,
        bundleId: check.bundle_id,
        receiptId: check.receipt_id,
        ticketId: check.ticket_id,
        role: check.role,
        verdict: check.verdict,
        completedAt: check.completed_at,
        failureReason: check.failure_reason,
        summary: check.summary,
        baselineChecksums: {
          content_checksum: check.baseline_content_checksum,
          bundle_checksum: check.baseline_bundle_checksum,
        },
        rebuiltChecksums: check.rebuilt_content_checksum && check.rebuilt_bundle_checksum
          ? {
              content_checksum: check.rebuilt_content_checksum,
              bundle_checksum: check.rebuilt_bundle_checksum,
            }
          : null,
        comparisons: check.comparisons,
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

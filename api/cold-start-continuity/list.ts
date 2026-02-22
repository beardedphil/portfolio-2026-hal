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
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 10

    // Fetch latest check and history
    const { data: checks, error } = await supabase
      .from('cold_start_continuity_checks')
      .select('*')
      .order('run_timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch checks: ${error.message}`,
      })
    }

    const latest = checks && checks.length > 0 ? checks[0] : null
    const history = checks && checks.length > 1 ? checks.slice(1) : []

    return json(res, 200, {
      success: true,
      latest: latest
        ? {
            runId: latest.run_id,
            runTimestamp: latest.run_timestamp,
            verdict: latest.verdict,
            failureReason: latest.failure_reason,
            summary: latest.summary,
            details: latest.details,
            errorMessage: latest.error_message,
          }
        : null,
      history: history.map((check) => ({
        runId: check.run_id,
        runTimestamp: check.run_timestamp,
        verdict: check.verdict,
        failureReason: check.failure_reason,
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

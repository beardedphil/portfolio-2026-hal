/**
 * API endpoint to list cold-start continuity check results.
 * Returns the latest check and history of prior runs.
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
      repoFullName?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(100, body.limit)) : 10

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    if (!repoFullName) {
      return json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch check history
    const { data: checks, error: listError } = await supabase
      .from('cold_start_continuity_checks')
      .select('*')
      .eq('repo_full_name', repoFullName)
      .order('completed_at', { ascending: false })
      .limit(limit)

    if (listError) {
      return json(res, 500, {
        success: false,
        error: `Failed to list checks: ${listError.message}`,
      })
    }

    // Format results
    const formattedChecks = (checks || []).map((check) => ({
      runId: check.run_id,
      verdict: check.verdict,
      failureReason: check.failure_reason || null,
      baselineChecksum: check.baseline_checksum || null,
      rebuiltChecksum: check.rebuilt_checksum || null,
      checksumMatch: check.checksum_match,
      bundleId: check.bundle_id || null,
      receiptId: check.receipt_id || null,
      integrationManifestReference: check.integration_manifest_reference || null,
      redReference: check.red_reference || null,
      summary: check.summary || null,
      completedAt: check.completed_at,
      createdAt: check.created_at,
    }))

    return json(res, 200, {
      success: true,
      checks: formattedChecks,
      latest: formattedChecks[0] || null,
      count: formattedChecks.length,
    })
  } catch (err) {
    console.error('Error in list cold-start continuity checks handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

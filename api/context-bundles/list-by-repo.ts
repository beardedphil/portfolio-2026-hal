/**
 * API endpoint to list Context Bundles for a repo (most recent first).
 * Returns bundles with their basic info and receipt references.
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
      limit?: number // Optional: limit number of results (default: 1 for most recent)
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 1

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!repoFullName) {
      return json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Build query - get most recent bundle for the repo
    const { data: bundles, error: listError } = await supabase
      .from('context_bundles')
      .select('bundle_id, ticket_id, role, version, created_at, created_by')
      .eq('repo_full_name', repoFullName)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (listError) {
      return json(res, 500, {
        success: false,
        error: `Failed to list bundles: ${listError.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      bundles: bundles || [],
      repo_full_name: repoFullName,
    })
  } catch (err) {
    console.error('Error in list context bundles by repo handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

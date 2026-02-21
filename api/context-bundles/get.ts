/**
 * API endpoint to get Context Bundle content by bundle_id.
 * Returns the full bundle JSON for a specific bundle.
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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!bundleId) {
      return json(res, 400, {
        success: false,
        error: 'bundleId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch bundle
    const { data: bundle, error: bundleError } = await supabase
      .from('context_bundles')
      .select('bundle_id, ticket_id, role, version, created_at, bundle_json, content_checksum, bundle_checksum')
      .eq('bundle_id', bundleId)
      .maybeSingle()

    if (bundleError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch bundle: ${bundleError.message}`,
      })
    }

    if (!bundle) {
      return json(res, 404, {
        success: false,
        error: `Bundle ${bundleId} not found.`,
      })
    }

    return json(res, 200, {
      success: true,
      bundle: {
        bundle_id: bundle.bundle_id,
        ticket_id: bundle.ticket_id,
        role: bundle.role,
        version: bundle.version,
        created_at: bundle.created_at,
        bundle_json: bundle.bundle_json,
        content_checksum: bundle.content_checksum,
        bundle_checksum: bundle.bundle_checksum,
      },
    })
  } catch (err) {
    console.error('Error in get context bundle handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

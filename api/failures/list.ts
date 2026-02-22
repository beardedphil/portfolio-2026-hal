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
      limit?: number
      offset?: number
      failure_type?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 1000) : 100
    const offset = typeof body.offset === 'number' && body.offset >= 0 ? body.offset : 0
    const failure_type = typeof body.failure_type === 'string' ? body.failure_type.trim() || undefined : undefined

    // Use service role key (preferred) to bypass RLS, fall back to anon key if not available
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Build query
    let query = supabase
      .from('failures')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by failure_type if provided
    if (failure_type) {
      query = query.eq('failure_type', failure_type)
    }

    const { data: failures, error } = await query

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch failures: ${error.message}`,
      })
      return
    }

    // Get total count for pagination
    let countQuery = supabase.from('failures').select('*', { count: 'exact', head: true })
    if (failure_type) {
      countQuery = countQuery.eq('failure_type', failure_type)
    }
    const { count, error: countError } = await countQuery

    if (countError) {
      json(res, 200, {
        success: false,
        error: `Failed to count failures: ${countError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      failures: failures || [],
      count: failures?.length || 0,
      total: count || 0,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[api/failures/list] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

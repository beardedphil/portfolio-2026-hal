import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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
    json(res, 405, { success: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      supabaseUrl?: string
      supabaseAnonKey?: string
      limit?: number
      offset?: number
      failureType?: string
    }

    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Build query
    let query = supabase
      .from('failures')
      .select('id, failure_type, root_cause, prevention_candidate, recurrence_count, first_seen_at, last_seen_at')
      .order('last_seen_at', { ascending: false })

    // Apply filters
    if (body.failureType) {
      query = query.eq('failure_type', body.failureType)
    }

    // Apply pagination
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 1000) : 100
    const offset = typeof body.offset === 'number' && body.offset >= 0 ? body.offset : 0
    query = query.range(offset, offset + limit - 1)

    const { data: failures, error: fetchError } = await query

    if (fetchError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch failures: ${fetchError.message}`,
      })
      return
    }

    // Get total count (for pagination)
    let countQuery = supabase.from('failures').select('id', { count: 'exact', head: true })
    if (body.failureType) {
      countQuery = countQuery.eq('failure_type', body.failureType)
    }
    const { count, error: countError } = await countQuery

    if (countError) {
      // Log but don't fail - count is optional
      console.warn(`[failures/list] Failed to fetch count: ${countError.message}`)
    }

    json(res, 200, {
      success: true,
      failures: failures || [],
      total: count || null,
      limit,
      offset,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

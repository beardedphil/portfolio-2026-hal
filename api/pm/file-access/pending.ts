import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function getQueryParam(req: IncomingMessage, name: string): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const v = url.searchParams.get(name)
    return v ? v : null
  } catch {
    return null
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  const sessionId = (getQueryParam(req, 'sessionId') ?? '').trim()
  const projectId = (getQueryParam(req, 'projectId') ?? '').trim() || null
  if (!sessionId) {
    json(res, 400, { pending: [], error: 'sessionId is required' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) {
    json(res, 503, { pending: [], error: 'Supabase is not configured for file access queue.' })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let q = supabase
    .from('hal_file_access_requests')
    .select('request_id, request_type, path, pattern, glob, max_lines, created_at')
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50)
  if (projectId) q = q.eq('project_id', projectId)

  const { data, error } = await q
  if (error) {
    json(res, 200, { pending: [], error: error.message })
    return
  }
  const pending = (data ?? []).map((r: any) => ({
    requestId: r.request_id,
    type: r.request_type,
    path: r.path ?? undefined,
    pattern: r.pattern ?? undefined,
    glob: r.glob ?? undefined,
    maxLines: r.max_lines ?? undefined,
    timestamp: new Date(r.created_at as string).getTime(),
  }))
  json(res, 200, { pending })
}


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
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      requestId?: string
      sessionId?: string
      success?: boolean
      content?: string
      matches?: Array<{ path: string; line: number; text: string }>
      error?: string
    }
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!requestId) {
      json(res, 400, { ok: false, error: 'requestId is required' })
      return
    }
    if (!sessionId) {
      json(res, 400, { ok: false, error: 'sessionId is required' })
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim()
    if (!supabaseUrl || !supabaseKey) {
      json(res, 503, { ok: false, error: 'Supabase is not configured for file access queue.' })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    // Ensure request exists and belongs to session
    const { data: row, error: fetchErr } = await supabase
      .from('hal_file_access_requests')
      .select('session_id')
      .eq('request_id', requestId)
      .maybeSingle()
    if (fetchErr) {
      json(res, 500, { ok: false, error: `Supabase fetch failed: ${fetchErr.message}` })
      return
    }
    if (!row) {
      json(res, 404, { ok: false, error: 'Unknown requestId' })
      return
    }
    if ((row as any).session_id !== sessionId) {
      json(res, 403, { ok: false, error: 'sessionId does not match request' })
      return
    }

    const nowIso = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('hal_file_access_requests')
      .update({
        status: 'completed',
        result_success: !!body.success,
        result_content: typeof body.content === 'string' ? body.content : null,
        result_matches: Array.isArray(body.matches) ? (body.matches as any) : null,
        result_error: typeof body.error === 'string' ? body.error : null,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('request_id', requestId)

    if (updateErr) {
      json(res, 500, { ok: false, error: `Supabase update failed: ${updateErr.message}` })
      return
    }

    json(res, 200, { ok: true })
  } catch (err) {
    json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}


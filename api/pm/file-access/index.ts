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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
      type?: string
      path?: string
      pattern?: string
      glob?: string
      maxLines?: number
      sessionId?: string
      projectId?: string
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
    const type = typeof body.type === 'string' ? body.type.trim() : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined

    if (!requestId || !type || !sessionId) {
      json(res, 400, { success: false, error: 'requestId, type, and sessionId are required.' })
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim()
    if (!supabaseUrl || !supabaseKey) {
      json(res, 503, {
        success: false,
        error: 'Supabase is not configured for file access queue. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in env.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const nowIso = new Date().toISOString()

    // Upsert request (idempotent)
    const { error: upsertErr } = await supabase.from('hal_file_access_requests').upsert(
      {
        request_id: requestId,
        session_id: sessionId,
        project_id: projectId ?? null,
        request_type: type,
        path: typeof body.path === 'string' ? body.path : null,
        pattern: typeof body.pattern === 'string' ? body.pattern : null,
        glob: typeof body.glob === 'string' ? body.glob : null,
        max_lines: typeof body.maxLines === 'number' ? body.maxLines : null,
        status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      { onConflict: 'request_id' }
    )
    if (upsertErr) {
      json(res, 500, { success: false, error: `Supabase upsert failed: ${upsertErr.message}` })
      return
    }

    // Wait for result (poll DB). Keep below typical serverless timeout.
    const timeoutMs = 20_000
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from('hal_file_access_requests')
        .select('status, result_success, result_content, result_matches, result_error')
        .eq('request_id', requestId)
        .maybeSingle()
      if (error) {
        json(res, 500, { success: false, error: `Supabase fetch failed: ${error.message}` })
        return
      }
      if (data && (data as any).status === 'completed') {
        const success = !!(data as any).result_success
        const content = (data as any).result_content as string | null
        const matches = (data as any).result_matches as any
        const errMsg = (data as any).result_error as string | null
        json(res, 200, {
          success,
          ...(typeof content === 'string' ? { content } : {}),
          ...(Array.isArray(matches) ? { matches } : matches ? { matches } : {}),
          ...(typeof errMsg === 'string' ? { error: errMsg } : {}),
        })
        return
      }
      await sleep(200)
    }

    json(res, 504, { success: false, error: 'Timed out waiting for file access result.' })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}


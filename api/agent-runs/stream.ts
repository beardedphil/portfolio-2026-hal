import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, getQueryParam, json as sendJson, validateMethod } from './_shared.js'
import { appendRunEvent } from './runEvents.js'
import { advanceRunWithProvider } from './providers/index.js'

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function sseEncode(event: { id?: number; event?: string; data?: unknown; comment?: string }): string {
  if (event.comment) return `: ${event.comment}\n\n`
  const lines: string[] = []
  if (typeof event.id === 'number') lines.push(`id: ${event.id}`)
  if (event.event) lines.push(`event: ${event.event}`)
  if (event.data !== undefined) {
    const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
    for (const line of payload.split('\n')) lines.push(`data: ${line}`)
  }
  return lines.join('\n') + '\n\n'
}

async function fetchEventsAfter(supabase: any, runId: string, afterId: number, limit = 200) {
  const { data, error } = await supabase
    .from('hal_agent_run_events')
    .select('id, type, payload, created_at')
    .eq('run_id', runId)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, events: (data ?? []) as Array<{ id: number; type: string; payload: unknown; created_at: string }> }
}

async function fetchRunStatus(supabase: any, runId: string) {
  const { data, error } = await supabase
    .from('hal_agent_runs')
    .select('run_id, agent_type, status, current_stage, error, provider, model, ticket_pk, repo_full_name, cursor_agent_id, cursor_status, pr_url, summary, progress, input_json, output_json, last_event_id, finished_at')
    .eq('run_id', runId)
    .maybeSingle()
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, run: data as any }
}

async function ensureTerminalEvent(supabase: any, runId: string) {
  const runRes = await fetchRunStatus(supabase, runId)
  if (!runRes.ok || !runRes.run) return
  const status = String(runRes.run.status ?? '')
  if (status === 'completed') {
    await appendRunEvent(supabase, runId, 'done', { summary: runRes.run.summary ?? 'Completed.' })
  } else if (status === 'failed') {
    await appendRunEvent(supabase, runId, 'error', { message: runRes.run.error ?? 'Run failed.' })
  }
}

type StreamArgs = { runId: string; afterEventId: number }

async function streamLoop(args: StreamArgs, write: (chunk: string) => void, isClosed: () => boolean) {
  const supabase = getServerSupabase()
  let afterId = args.afterEventId
  let lastKeepAliveAt = Date.now()

  write(sseEncode({ comment: 'ok' }))

  while (!isClosed()) {
    const ev = await fetchEventsAfter(supabase, args.runId, afterId)
    if (!ev.ok) {
      write(sseEncode({ event: 'error', data: { message: ev.error } }))
      break
    }

    if (ev.events.length) {
      for (const e of ev.events) {
        afterId = Math.max(afterId, Number(e.id) || afterId)
        write(
          sseEncode({
            id: e.id,
            event: String(e.type || 'message'),
            data: { type: e.type, payload: e.payload, created_at: e.created_at },
          })
        )
      }
      continue
    }

    const runRes = await fetchRunStatus(supabase, args.runId)
    if (!runRes.ok) {
      write(sseEncode({ event: 'error', data: { message: runRes.error } }))
      break
    }
    const run = runRes.run
    if (!run) {
      write(sseEncode({ event: 'error', data: { message: 'Unknown runId' } }))
      break
    }

    const status = String(run.status ?? '')
    if (status === 'completed' || status === 'failed') {
      // If the provider completed without writing a terminal event, write one so the client always sees closure.
      await ensureTerminalEvent(supabase, args.runId)
      const final = await fetchEventsAfter(supabase, args.runId, afterId)
      if (final.ok && final.events.length) continue
      break
    }

    // Kick work in budgeted slices. OpenAI runs need a larger slice to avoid endless abort/retry loops.
    const budgetMs =
      run.agent_type === 'implementation' || run.agent_type === 'qa'
        ? 12_000
        : 45_000
    await advanceRunWithProvider({ supabase, run, budgetMs }).catch(() => null)

    const now = Date.now()
    if (now - lastKeepAliveAt > 15_000) {
      lastKeepAliveAt = now
      write(sseEncode({ comment: 'keep-alive' }))
    }

    await sleep(500)
  }
}

function parseArgsFromUrl(url: string, lastEventIdHeader: string | null): StreamArgs {
  const u = new URL(url)
  const runId = (u.searchParams.get('runId') ?? '').trim()
  const afterParam = u.searchParams.get('afterEventId') ?? u.searchParams.get('after') ?? ''
  const headerId = lastEventIdHeader ?? ''
  const raw = afterParam || headerId
  const afterEventId = raw && /^\d+$/.test(raw) ? Number(raw) : 0
  return { runId, afterEventId }
}

export async function GET(request: Request): Promise<Response> {
  const args = parseArgsFromUrl(request.url, request.headers.get('last-event-id'))
  if (!args.runId) return Response.json({ error: 'runId is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const write = (chunk: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(chunk))
      }
      const isClosed = () => closed

      streamLoop(args, write, isClosed)
        .catch((e) => {
          write(sseEncode({ event: 'error', data: { message: e instanceof Error ? e.message : String(e) } }))
        })
        .finally(() => {
          closed = true
          try {
            controller.close()
          } catch {
            // ignore
          }
        })

      request.signal?.addEventListener('abort', () => {
        closed = true
        try {
          controller.close()
        } catch {
          // ignore
        }
      })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  })
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) return GET(req)
  if (!res) throw new Error('Response object missing')
  if (!validateMethod(req as IncomingMessage, res, 'GET')) return

  const runId = (getQueryParam(req as IncomingMessage, 'runId') ?? '').trim()
  if (!runId) {
    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 400, { error: 'runId is required' })
    return
  }
  const afterRaw =
    (getQueryParam(req as IncomingMessage, 'afterEventId') ??
      getQueryParam(req as IncomingMessage, 'after') ??
      (req as IncomingMessage).headers['last-event-id'] ??
      '') as string
  const afterEventId = typeof afterRaw === 'string' && /^\d+$/.test(afterRaw) ? Number(afterRaw) : 0

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  ;(res as any).flushHeaders?.()

  let closed = false
  req.on('close', () => {
    closed = true
  })

  const write = (chunk: string) => {
    if (closed) return
    res.write(chunk)
  }
  const isClosed = () => closed

  streamLoop({ runId, afterEventId }, write, isClosed)
    .catch((e) => {
      write(sseEncode({ event: 'error', data: { message: e instanceof Error ? e.message : String(e) } }))
    })
    .finally(() => {
      try {
        res.end()
      } catch {
        // ignore
      }
    })
}


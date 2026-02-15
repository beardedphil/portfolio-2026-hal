import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, getCursorApiKey, appendProgress } from './_shared.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

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

/**
 * HAL endpoint: cancel one or all active Cursor cloud agent runs (uses HAL env: Supabase, Cursor API key).
 * Cursor API: DELETE https://api.cursor.com/v0/agents/:id
 *
 * POST body:
 *   - runId: string (optional) — cancel this run only
 *   - cancelAll: boolean (optional) — cancel all runs that are not finished/failed
 *
 * GET query (for browser or simple curl):
 *   - cancelAll=true — cancel all active runs
 *   - runId=... — cancel single run
 *
 * Examples:
 *   GET https://your-hal.vercel.app/api/agent-runs/cancel?cancelAll=true
 *   curl -X POST https://your-hal.vercel.app/api/agent-runs/cancel -H "Content-Type: application/json" -d '{"cancelAll":true}'
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  let runId: string | undefined
  let cancelAll: boolean

  if (method === 'GET') {
    runId = (getQueryParam(req, 'runId') ?? '').trim() || undefined
    cancelAll = getQueryParam(req, 'cancelAll') === 'true'
  } else if (method === 'POST') {
    const body = (await readJsonBody(req)) as { runId?: string; cancelAll?: boolean }
    runId = typeof body.runId === 'string' ? body.runId.trim() || undefined : undefined
    cancelAll = body.cancelAll === true
  } else {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, POST')
    res.end('Method Not Allowed')
    return
  }

  try {

    if (!runId && !cancelAll) {
      json(res, 400, {
        error: 'Provide runId (cancel one run) or cancelAll: true (cancel all active runs).',
      })
      return
    }

    const supabase = getServerSupabase()
    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')

    type RunRow = {
      run_id: string
      cursor_agent_id: string | null
      status: string
      progress: unknown
      display_id?: string
    }

    let runs: RunRow[] = []

    if (cancelAll) {
      const { data, error } = await supabase
        .from('hal_agent_runs')
        .select('run_id, cursor_agent_id, status, progress, display_id')
        .in('status', ['created', 'launching', 'polling'])
        .not('cursor_agent_id', 'is', null)
      if (error) {
        json(res, 500, { error: `Failed to list runs: ${error.message}` })
        return
      }
      runs = (data ?? []) as RunRow[]
    } else if (runId) {
      const { data, error } = await supabase
        .from('hal_agent_runs')
        .select('run_id, cursor_agent_id, status, progress, display_id')
        .eq('run_id', runId)
        .maybeSingle()
      if (error) {
        json(res, 500, { error: `Failed to fetch run: ${error.message}` })
        return
      }
      if (!data) {
        json(res, 404, { error: 'Run not found' })
        return
      }
      const run = data as RunRow
      if (run.status === 'finished' || run.status === 'failed') {
        json(res, 200, { cancelled: 0, message: 'Run already in terminal state', runId })
        return
      }
      if (!run.cursor_agent_id) {
        json(res, 200, {
          cancelled: 0,
          message: 'Run has no Cursor agent ID yet (may still be creating)',
          runId,
        })
        return
      }
      runs = [run]
    }

    let cancelled = 0
    const errors: string[] = []

    for (const run of runs) {
      const cid = run.cursor_agent_id
      if (!cid) continue
      const deleteRes = await fetch(`https://api.cursor.com/v0/agents/${cid}`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${auth}` },
      })
      const displayId = run.display_id ?? run.run_id
      if (!deleteRes.ok) {
        const text = await deleteRes.text()
        errors.push(`${displayId}: ${deleteRes.status} ${text.slice(0, 100)}`)
        continue
      }
      const progress = appendProgress(
        Array.isArray(run.progress) ? run.progress : [],
        'Cancelled by user (stop usage).'
      )
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: 'Cancelled by user.',
          progress,
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', run.run_id)
      cancelled++
    }

    json(res, 200, {
      cancelled,
      total: runs.length,
      errors: errors.length ? errors : undefined,
      message:
        cancelled === runs.length
          ? `Cancelled ${cancelled} agent run(s).`
          : `Cancelled ${cancelled}/${runs.length}; some failed: ${errors.join('; ')}`,
    })
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

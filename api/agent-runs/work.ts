import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, json as sendJson, readJsonBody, validateMethod } from './_shared.js'
import { appendRunEvent } from './runEvents.js'
import { advanceRunWithProvider } from './providers/index.js'

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

type WorkBody = { runId?: string; budgetMs?: number }

async function handle(runIdRaw: string, budgetMsRaw: number | null): Promise<Response | { statusCode: number; body: unknown }> {
  const runId = runIdRaw.trim()
  if (!runId) return { statusCode: 400, body: { error: 'runId is required.' } }

  const budgetMs =
    typeof budgetMsRaw === 'number' && Number.isFinite(budgetMsRaw) && budgetMsRaw > 0
      ? Math.min(Math.max(1_000, Math.floor(budgetMsRaw)), 55_000)
      : 25_000

  const supabase = getServerSupabase()
  const { data: run, error: runErr } = await supabase
    .from('hal_agent_runs')
    .select(
      'run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, provider, provider_run_id, model, input_json, output_json, last_event_id'
    )
    .eq('run_id', runId)
    .maybeSingle()

  if (runErr) return { statusCode: 500, body: { error: `Supabase fetch failed: ${runErr.message}` } }
  if (!run) return { statusCode: 404, body: { error: 'Unknown runId' } }

  const advance = await advanceRunWithProvider({ supabase, run: run as any, budgetMs })
  if (!advance.ok) {
    const msg = (advance as { ok: false; error: string }).error.slice(0, 500)
    await supabase
      .from('hal_agent_runs')
      .update({ status: 'failed', current_stage: 'failed', error: msg, finished_at: new Date().toISOString() })
      .eq('run_id', runId)
    await appendRunEvent(supabase, runId, 'error', { message: msg })
    return { statusCode: 200, body: { runId, status: 'failed', error: msg } }
  }

  const { data: run2 } = await supabase
    .from('hal_agent_runs')
    .select(
      'run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, provider, provider_run_id, model, input_json, output_json, last_event_id, created_at, updated_at, finished_at'
    )
    .eq('run_id', runId)
    .maybeSingle()

  return { statusCode: 200, body: { ok: true, done: advance.done, run: run2 ?? run } }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as WorkBody
    const result = await handle(String(body.runId ?? ''), typeof body.budgetMs === 'number' ? body.budgetMs : null)
    if (result instanceof Response) return result
    return Response.json(result.body, { status: result.statusCode, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/agent-runs/work] POST', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) return POST(req)
  if (!res) throw new Error('Response object missing')
  if (!validateMethod(req as IncomingMessage, res, 'POST')) return

  try {
    const body = (await readJsonBody(req as IncomingMessage)) as WorkBody
    const result = await handle(String(body.runId ?? ''), typeof body.budgetMs === 'number' ? body.budgetMs : null)
    if (result instanceof Response) {
      sendJson(res, 500, { error: 'Unexpected Response return in Node handler.' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, result.statusCode, result.body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/agent-runs/work]', msg, err)
    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 500, { error: msg })
  }
}


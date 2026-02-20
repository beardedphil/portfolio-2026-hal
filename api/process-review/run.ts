import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, appendProgress } from '../agent-runs/_shared.js'

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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    const supabase = getServerSupabase()

    // Fetch ticket
    const ticketQuery = ticketPk
      ? await supabase
          .from('tickets')
          .select('pk, repo_full_name, ticket_number, display_id')
          .eq('pk', ticketPk)
          .maybeSingle()
      : await supabase
          .from('tickets')
          .select('pk, repo_full_name, ticket_number, display_id')
          .eq('id', ticketId!)
          .maybeSingle()

    if (ticketQuery.error || !ticketQuery.data) {
      json(res, 200, {
        success: false,
        error: `Ticket not found: ${ticketQuery.error?.message || 'Unknown error'}`,
      })
      return
    }

    const ticket = ticketQuery.data

    const displayId = (ticket as any).display_id ?? String((ticket as any).ticket_number ?? '').padStart(4, '0')
    const initialProgress = appendProgress([], `Launching process-review run for ${displayId}`)
    const model =
      process.env.OPENAI_PROCESS_REVIEW_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      'gpt-5.2'

    const { data: runRow, error: runInsErr } = await supabase
      .from('hal_agent_runs')
      .insert({
        agent_type: 'process-review',
        repo_full_name: (ticket as any).repo_full_name,
        ticket_pk: (ticket as any).pk,
        ticket_number: (ticket as any).ticket_number ?? null,
        display_id: displayId,
        provider: 'openai',
        model,
        status: 'created',
        current_stage: 'preparing',
        progress: initialProgress,
      })
      .select('run_id')
      .maybeSingle()

    if (runInsErr || !runRow?.run_id) {
      json(res, 500, { success: false, error: `Failed to create run: ${runInsErr?.message ?? 'unknown'}` })
      return
    }

    json(res, 200, {
      success: true,
      runId: runRow.run_id,
      status: 'created',
      streamUrl: `/api/agent-runs/stream?runId=${encodeURIComponent(String(runRow.run_id))}`,
      workUrl: `/api/agent-runs/work`,
    })
  } catch (err) {
    // Note: We can't store errors in the database here because we don't have access to the request body
    // (it's already been consumed). Errors are logged and returned to the client.
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

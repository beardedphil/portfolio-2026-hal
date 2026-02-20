import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, appendProgress } from '../agent-runs/_shared.js'
import { advanceRunWithProvider } from '../agent-runs/providers/index.js'

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
      message?: string
      conversationId?: string
      projectId?: string
      repoFullName?: string
      defaultBranch?: string
      images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
      model?: string
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
    const images = Array.isArray(body.images) ? body.images : undefined
    const modelOverride = typeof body.model === 'string' ? body.model.trim() : ''

    if (!message) {
      json(res, 400, { error: 'message is required.' })
      return
    }
    if (!repoFullName || !repoFullName.trim()) {
      json(res, 400, { error: 'repoFullName is required.' })
      return
    }

    // Check OpenAI configuration
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
    const openaiModel =
      modelOverride ||
      process.env.OPENAI_PM_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      'gpt-5.2'

    if (!openaiApiKey) {
      json(res, 503, {
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY in environment variables to enable the Project Manager chat.',
      })
      return
    }

    const supabase = getServerSupabase()

    const initialProgress = appendProgress([], `Launching project-manager run for ${repoFullName || 'unknown repo'}`)
    const { data: runRow, error: runInsErr } = await supabase
      .from('hal_agent_runs')
      .insert({
        agent_type: 'project-manager',
        repo_full_name: repoFullName,
        ticket_pk: null,
        ticket_number: null,
        display_id: null,
        provider: 'openai',
        model: openaiModel,
        status: 'created',
        current_stage: 'preparing',
        progress: initialProgress,
        input_json: {
          message,
          conversationId: conversationId || null,
          projectId: projectId || null,
          defaultBranch,
          images: images ?? null,
        },
      })
      .select('run_id')
      .maybeSingle()

    if (runInsErr || !runRow?.run_id) {
      json(res, 500, { error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` })
      return
    }

    const runId = runRow.run_id as string
    const { data: run } = await supabase
      .from('hal_agent_runs')
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, provider, provider_run_id, model, input_json, output_json, last_event_id')
      .eq('run_id', runId)
      .maybeSingle()
    if (!run) {
      json(res, 500, { error: 'Failed to read run row after creation.' })
      return
    }

    // Best-effort: run one work slice so old clients still get a reply in a single request.
    await advanceRunWithProvider({ supabase, run: run as any, budgetMs: 45_000 }).catch(() => null)
    const { data: updated } = await supabase
      .from('hal_agent_runs')
      .select('summary, status, error')
      .eq('run_id', runId)
      .maybeSingle()

    json(res, 200, {
      runId,
      status: updated?.status ?? 'running',
      reply: updated?.summary ?? '',
      error: updated?.error ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[pm/respond] Error:', message)
    json(res, 500, {
      error: message,
    })
  }
}

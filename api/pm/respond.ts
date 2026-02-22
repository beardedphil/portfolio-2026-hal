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
    let conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
      : undefined

    const previousResponseId =
      typeof body.previous_response_id === 'string'
        ? body.previous_response_id
        : undefined
    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined

    // GitHub API for repo inspection: need token (from session) + repoFullName
    const session = await getSession(req, res)
    const encryptedToken = session.github?.accessToken
    let githubToken: string | undefined
    if (encryptedToken) {
      try {
        const { decryptAccessToken } = await import('../_lib/github/session.js')
        githubToken = decryptAccessToken(encryptedToken)
      } catch (err) {
        console.error('[api/pm/respond] Failed to decrypt GitHub token:', err instanceof Error ? err.message : String(err))
        // Continue without GitHub access
      }
    }
    const githubReadFile =
      githubToken && repoFullName
        ? (filePath: string, maxLines = 500) =>
            fetchFileContents(githubToken, repoFullName, filePath, maxLines)
        : undefined
    const githubSearchCode =
      githubToken && repoFullName
        ? (pattern: string, glob?: string) => searchCode(githubToken, repoFullName, pattern, glob)
        : undefined

    // Allow empty message if images are present
    const hasImages = Array.isArray(body.images) && body.images.length > 0
    if (!message.trim() && !hasImages) {
      json(res, 400, { error: 'Message is required (or attach an image)' })
      return
    }

    const key = process.env.OPENAI_API_KEY?.trim()
    const model = process.env.OPENAI_MODEL?.trim()

    if (!key || !model) {
      json(res, 503, {
        reply: '',
        toolCalls: [],
        outboundRequest: null,
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
        errorPhase: 'openai',
      } satisfies PmAgentResponse)
      return
    }

    // Load hal-agents runner (prefer dist output).
    // On Vercel, repo root is process.cwd().
    const repoRoot = process.cwd()
    let runnerModule:
      | {
          getSharedRunner?: () => {
            label: string
            run: (msg: string, config: object) => Promise<any>
          }
          summarizeForContext?: (msgs: unknown[], key: string, model: string) => Promise<string>
        }
      | null = null

    try {
      const runnerDistPath = path.resolve(repoRoot, 'projects/hal-agents/dist/agents/runner.js')
      runnerModule = await import(pathToFileURL(runnerDistPath).href)
    } catch {
      // If dist isn't present, we'll fall through and return stub.
      runnerModule = null
    }

    // When project DB (Supabase) is provided, fetch full history and build bounded context pack (summary + recent by content size)
    const RECENT_MAX_CHARS = 12_000
    let conversationContextPack: string | undefined
    if (projectId && supabaseUrl && supabaseAnonKey && runnerModule) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        const { data: rows } = await supabase
          .from('hal_conversation_messages')
          .select('role, content, sequence')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .order('sequence', { ascending: true })

        const messages = (rows ?? []).map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: r.content ?? '',
        }))

        const recentFromEnd: typeof messages = []
        let recentLen = 0
        for (let i = messages.length - 1; i >= 0; i--) {
          const t = messages[i]
          const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
          if (recentLen + lineLen > RECENT_MAX_CHARS && recentFromEnd.length > 0) break
          recentFromEnd.unshift(t)
          recentLen += lineLen
        }

        const olderCount = messages.length - recentFromEnd.length
        if (olderCount > 0) {
          const older = messages.slice(0, olderCount)
          const { data: summaryRow } = await supabase
            .from('hal_conversation_summaries')
            .select('summary_text, through_sequence')
            .eq('project_id', projectId)
            .eq('agent', 'project-manager')
            .single()

          const needNewSummary =
            !summaryRow || (summaryRow.through_sequence ?? 0) < olderCount
          let summaryText: string

          if (needNewSummary && typeof runnerModule.summarizeForContext === 'function') {
            summaryText = await runnerModule.summarizeForContext(older, key, model)
            await supabase.from('hal_conversation_summaries').upsert(
              {
                project_id: projectId,
                agent: 'project-manager',
                summary_text: summaryText,
                through_sequence: olderCount,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'project_id,agent' }
            )
          } else if (summaryRow?.summary_text) {
            summaryText = summaryRow.summary_text
          } else {
            summaryText = `(${older.length} older messages)`
          }

          conversationContextPack = `Summary of earlier conversation:\n\n${summaryText}\n\nRecent conversation (within ${RECENT_MAX_CHARS.toLocaleString()} characters):\n\n${recentFromEnd
            .map((t) => `**${t.role}**: ${t.content}`)
            .join('\n\n')}`
        } else if (messages.length > 0) {
          conversationContextPack = messages
            .map((t) => `**${t.role}**: ${t.content}`)
            .join('\n\n')
        }

        // Use DB-derived context pack instead of client-provided history
        conversationHistory = undefined
      } catch {
        // If DB context fails, fall back to client history.
      }
    }

    const runner = runnerModule?.getSharedRunner?.()
    if (!runner?.run) {
      const stubResponse: PmAgentResponse = {
        reply:
          '[PM Agent] The PM agent core is not yet available on this deployment (hal-agents runner not found).\n\nYour message was: "' +
          message +
          '"',
        toolCalls: [],
        outboundRequest: {
          _stub: true,
          _note: 'hal-agents runner dist not available',
          model,
          message,
        },
        error: 'PM agent runner not available (missing hal-agents dist)',
        errorPhase: 'not-implemented',
      }
      json(res, 200, stubResponse)
      return
    }

    const createTicketAvailable = !!(supabaseUrl && supabaseAnonKey)
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
    await advanceRunWithProvider({ supabase, run: run as any, budgetMs: 55_000 }).catch(() => null)
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

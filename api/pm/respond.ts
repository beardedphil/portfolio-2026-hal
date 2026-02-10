import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'
import { fetchFileContents, searchCode } from '../_lib/github/githubApi.js'
import { getSession } from '../_lib/github/session.js'

type PmAgentResponse = {
  reply: string
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>
  outboundRequest: object | null
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  ticketCreationResult?: {
    id: string
    filename: string
    filePath: string
    syncSuccess: boolean
    syncError?: string
    retried?: boolean
    attempts?: number
    /** True when ticket was automatically moved to To Do (0083). */
    movedToTodo?: boolean
    /** Error message if auto-move to To Do failed (0083). */
    moveError?: string
    /** True if ticket is ready to start (0083). */
    ready?: boolean
    /** Missing items if ticket is not ready (0083). */
    missingItems?: string[]
    /** True if ticket was auto-fixed (formatting issues resolved) (0095). */
    autoFixed?: boolean
  }
  createTicketAvailable?: boolean
  agentRunner?: string
}

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
      conversationHistory?: Array<{ role: string; content: string }>
      previous_response_id?: string
      projectId?: string
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
    }

    const message = body.message ?? ''
    let conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
      : undefined

    const previousResponseId =
      typeof body.previous_response_id === 'string'
        ? body.previous_response_id
        : undefined

    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const repoFullName =
      typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined

    // GitHub API for repo inspection: need token (from session) + repoFullName
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    // Debug logging (0119: fix PM agent repo selection) - use console.warn for visibility
    console.warn(`[PM] Request received - repoFullName: ${repoFullName || 'NOT PROVIDED'}, hasToken: ${!!githubToken}, tokenLength: ${githubToken?.length || 0}`)
    if (repoFullName && !githubToken) {
      console.warn(`[PM] repoFullName provided (${repoFullName}) but no GitHub token in session`)
    }
    if (githubToken && !repoFullName) {
      console.warn(`[PM] GitHub token available but no repoFullName provided`)
    }
    const githubReadFile =
      githubToken && repoFullName
        ? (filePath: string, maxLines = 500) => {
            console.log(`[PM] Using GitHub API to read file: ${repoFullName}/${filePath}`)
            return fetchFileContents(githubToken, repoFullName, filePath, maxLines)
          }
        : undefined
    const githubSearchCode =
      githubToken && repoFullName
        ? (pattern: string, glob?: string) => {
            console.log(`[PM] Using GitHub API to search: ${repoFullName} pattern: ${pattern}`)
            return searchCode(githubToken, repoFullName, pattern, glob)
          }
        : undefined
    if (!githubReadFile && repoFullName) {
      console.warn(`[PM] githubReadFile is undefined even though repoFullName=${repoFullName} - token missing?`)
    }

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

    const config = {
      repoRoot,
      openaiApiKey: key,
      openaiModel: model,
      conversationHistory,
      conversationContextPack,
      previousResponseId,
      ...(createTicketAvailable
        ? { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(repoFullName ? { repoFullName } : {}),
      ...(githubReadFile ? { githubReadFile } : {}),
      ...(githubSearchCode ? { githubSearchCode } : {}),
      ...(images ? { images } : {}),
    }
    // Debug: log what's being passed to PM agent (0119) - use console.warn for visibility
    console.warn(`[PM] Config passed to runner: repoFullName=${config.repoFullName || 'NOT SET'}, hasGithubReadFile=${typeof config.githubReadFile === 'function'}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'}`)
    const result = (await runner.run(message, config)) as PmAgentResponse & {
      toolCalls: Array<{ name: string; input: unknown; output: unknown }>
    }

    // Supabase-only (0065): no docs/tickets sync in serverless.
    // Still provide ticketCreationResult so UI can show a summary message.
    let ticketCreationResult: PmAgentResponse['ticketCreationResult']
    const createTicketCall = result.toolCalls?.find(
      (c) =>
        c.name === 'create_ticket' &&
        typeof c.output === 'object' &&
        c.output !== null &&
        (c.output as { success?: boolean }).success === true
    )
    if (createTicketCall) {
      const out = createTicketCall.output as any
      ticketCreationResult = {
        id: String(out.display_id ?? out.id ?? ''),
        filename: String(out.filename ?? ''),
        filePath: String(out.filePath ?? ''),
        syncSuccess: true,
        ...(out.retried && out.attempts != null && { retried: true, attempts: out.attempts }),
        ...(out.movedToTodo && { movedToTodo: true }),
        ...(out.moveError && { moveError: String(out.moveError) }),
        ...(typeof out.ready === 'boolean' && { ready: out.ready }),
        ...(Array.isArray(out.missingItems) && out.missingItems.length > 0 && { missingItems: out.missingItems }),
        ...(out.autoFixed && { autoFixed: true }),
      }
    }

    const response: PmAgentResponse = {
      reply: result.reply,
      toolCalls: result.toolCalls ?? [],
      outboundRequest: result.outboundRequest ?? null,
      ...(result.responseId != null && { responseId: result.responseId }),
      ...(result.error != null && { error: result.error }),
      ...(result.errorPhase != null && { errorPhase: result.errorPhase }),
      ...(ticketCreationResult != null && { ticketCreationResult }),
      createTicketAvailable,
      agentRunner: runner.label,
    }

    json(res, 200, response)
  } catch (err) {
    json(res, 500, {
      reply: '',
      toolCalls: [],
      outboundRequest: null,
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'openai',
    } satisfies PmAgentResponse)
  }
}


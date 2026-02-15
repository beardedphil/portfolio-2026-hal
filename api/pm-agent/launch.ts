import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, getCursorApiKey, humanReadableCursorError, appendProgress } from '../agent-runs/_shared.js'
import { getOrigin } from '../_lib/github/config.js'

const PM_CURSOR_MODEL = 'gpt-5.2'

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

async function checkExistingThread(
  supabase: any,
  conversationId: string,
  projectId: string
): Promise<{ hasExistingThread: boolean; previousCursorAgentId: string | null }> {
  const { data: thread } = await supabase
    .from('hal_pm_conversation_threads')
    .select('cursor_agent_id')
    .eq('project_id', projectId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  
  if (!thread?.cursor_agent_id) {
    return { hasExistingThread: false, previousCursorAgentId: null }
  }
  
  return { hasExistingThread: true, previousCursorAgentId: thread.cursor_agent_id }
}

async function fetchConversationHistory(
  supabase: any,
  conversationId: string,
  projectId: string,
  limit: number = 20
): Promise<Array<{ role: string; content: string }>> {
  try {
    const { data: messages } = await supabase
      .from('hal_conversation_messages')
      .select('role, content')
      .eq('project_id', projectId)
      .eq('agent', conversationId)
      .order('sequence', { ascending: false })
      .limit(limit)
    if (!messages?.length) return []
    return [...messages].reverse()
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).trim() }))
  } catch (e) {
    console.warn('[pm-agent/launch] Failed to fetch conversation history:', e instanceof Error ? e.message : e)
    return []
  }
}

function buildPromptText(
  repoFullName: string,
  defaultBranch: string,
  halApiBaseUrl: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): string {
  const baseLines = [
    'You are the Project Manager agent for this repository. Use the codebase and any available tools to help with planning, prioritization, ticket creation, and project decisions.',
    '',
    '## Inputs (provided by HAL)',
    `- **repoFullName**: ${repoFullName}`,
    `- **defaultBranch**: ${defaultBranch}`,
    `- **HAL API base URL**: ${halApiBaseUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required for ticket moves): `POST /api/tickets/move`, `POST /api/tickets/get`, `POST /api/tickets/list-by-column`, `POST /api/columns/list`.',
  ]
  const historyLines = conversationHistory.length > 0
    ? ['', '## Conversation history', '', ...conversationHistory.flatMap((m) => [`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`, '']), '---', '']
    : []
  return [...baseLines, ...historyLines, '**Current user message:**', message].join('\n')
}

async function createNewAgent(
  supabase: any,
  repoFullName: string,
  defaultBranch: string,
  message: string,
  halApiBaseUrl: string,
  auth: string,
  repoUrl: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<{ runId: string; cursorAgentId: string; cursorStatus: string }> {
  const initialProgress = appendProgress([], `Launching PM agent for ${repoFullName}`)
  const { data: runRow, error: runInsErr } = await supabase
    .from('hal_agent_runs')
    .insert({
      agent_type: 'project-manager',
      repo_full_name: repoFullName,
      ticket_pk: null,
      ticket_number: null,
      display_id: null,
      status: 'launching',
      progress: initialProgress,
    })
    .select('run_id')
    .maybeSingle()

  if (runInsErr || !runRow?.run_id) {
    throw new Error(`Failed to create run row: ${runInsErr?.message ?? 'unknown'}`)
  }

  const runId = runRow.run_id as string
  const promptText = buildPromptText(repoFullName, defaultBranch, halApiBaseUrl, message, conversationHistory)

  const launchRes = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: { text: promptText },
      source: { repository: repoUrl, ref: defaultBranch },
      target: { branchName: defaultBranch },
      model: PM_CURSOR_MODEL,
    }),
  })

  const launchText = await launchRes.text()
  if (!launchRes.ok) {
    const msg = humanReadableCursorError(launchRes.status, launchText)
    await supabase.from('hal_agent_runs').update({ status: 'failed', error: msg, progress: appendProgress(initialProgress, `Launch failed: ${msg}`), finished_at: new Date().toISOString() }).eq('run_id', runId)
    throw new Error(msg)
  }
  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    const msg = 'Invalid response from Cursor API when launching agent.'
    await supabase.from('hal_agent_runs').update({ status: 'failed', error: msg, progress: appendProgress(initialProgress, msg), finished_at: new Date().toISOString() }).eq('run_id', runId)
    throw new Error(msg)
  }
  const cursorAgentId = launchData.id ?? ''
  const cursorStatus = launchData.status ?? 'CREATING'
  if (!cursorAgentId) {
    const msg = 'Cursor API did not return an agent ID.'
    await supabase.from('hal_agent_runs').update({ status: 'failed', error: msg, progress: appendProgress(initialProgress, msg), finished_at: new Date().toISOString() }).eq('run_id', runId)
    throw new Error(msg)
  }

  const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${cursorStatus}).`)
  await supabase
    .from('hal_agent_runs')
    .update({
      status: 'polling',
      cursor_agent_id: cursorAgentId,
      cursor_status: cursorStatus,
      progress: progressAfterLaunch,
    })
    .eq('run_id', runId)

  return { runId, cursorAgentId, cursorStatus }
}

/**
 * Launch a Cursor Cloud Agent for the Project Manager role.
 * Uses gpt-5.2. For continuing conversations, includes conversation history in the prompt.
 * 
 * Since Cursor Cloud Agents API doesn't support sending follow-up messages to existing agents,
 * we create a new agent for each message but:
 * 1. Include conversation history in the prompt for context
 * 2. Maintain the same cursor_agent_id mapping in hal_pm_conversation_threads (updated with new agent ID)
 * 3. Return isContinuing=true when reusing an existing thread mapping
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      message?: string
      repoFullName?: string
      defaultBranch?: string
      conversationId?: string
      projectId?: string
      restart?: boolean
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined
    const restart = body.restart === true

    // If restarting, message is optional (just clearing the mapping)
    if (!restart && !message) {
      json(res, 400, { error: 'message is required.' })
      return
    }
    if (!repoFullName) {
      json(res, 400, { error: 'repoFullName is required. Connect a GitHub repo first.' })
      return
    }

    const halApiBaseUrl = getOrigin(req)

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')
    const repoUrl = `https://github.com/${repoFullName}`
    const supabase = getServerSupabase()

    // If restarting, clear the mapping and return early
    if (restart && conversationId && projectId) {
      await supabase
        .from('hal_pm_conversation_threads')
        .delete()
        .eq('project_id', projectId)
        .eq('conversation_id', conversationId)
      json(res, 200, { success: true, message: 'Conversation thread mapping cleared' })
      return
    }

    // Check for existing thread mapping to determine if we're continuing a conversation
    let isContinuing = false
    let conversationHistory: Array<{ role: string; content: string }> = []
    if (conversationId && projectId && !restart) {
      const existing = await checkExistingThread(supabase, conversationId, projectId)
      if (existing.hasExistingThread) {
        isContinuing = true
        // Fetch conversation history to include in the prompt
        conversationHistory = await fetchConversationHistory(supabase, conversationId, projectId, 20)
      }
    }

    // Always create a new agent for each message (Cursor doesn't support follow-up messages)
    // But include conversation history in the prompt so the agent has context
    let cursorAgentId: string
    let cursorStatus: string
    let runId: string

    try {
      const result = await createNewAgent(
        supabase,
        repoFullName,
        defaultBranch,
        message,
        halApiBaseUrl,
        auth,
        repoUrl,
        conversationHistory
      )
      runId = result.runId
      cursorAgentId = result.cursorAgentId
      cursorStatus = result.cursorStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      json(res, 200, { runId: '', status: 'failed', error: msg })
      return
    }

    // Store or update the conversation thread mapping
    if (conversationId && projectId) {
      await supabase
        .from('hal_pm_conversation_threads')
        .upsert(
          {
            project_id: projectId,
            conversation_id: conversationId,
            cursor_agent_id: cursorAgentId,
          },
          { onConflict: 'project_id,conversation_id' }
        )
    }

    json(res, 200, { 
      runId, 
      status: 'polling', 
      cursorAgentId,
      isContinuing: isContinuing,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[pm-agent/launch] Error:', message)
    const isConfigError =
      /Supabase server env is missing|Cursor API is not configured/i.test(message)
    const statusCode = isConfigError ? 503 : 500
    json(res, statusCode, { error: isConfigError ? message : 'Launch failed. Check server logs.' })
  }
}

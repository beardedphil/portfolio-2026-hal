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
  projectId: string,
  auth: string
): Promise<{ cursorAgentId: string | null; runId: string | null }> {
  const { data: thread } = await supabase
    .from('hal_pm_conversation_threads')
    .select('cursor_agent_id')
    .eq('project_id', projectId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  
  if (!thread?.cursor_agent_id) return { cursorAgentId: null, runId: null }
  
  try {
    const statusRes = await fetch(`https://api.cursor.com/v0/agents/${thread.cursor_agent_id}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as { status?: string }
      const status = statusData.status ?? ''
      if (status === 'RUNNING' || status === 'CREATING') {
        const { data: existingRun } = await supabase
          .from('hal_agent_runs')
          .select('run_id, status')
          .eq('cursor_agent_id', thread.cursor_agent_id)
          .eq('agent_type', 'project-manager')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        if (existingRun?.run_id && existingRun.status === 'polling') {
          return { cursorAgentId: thread.cursor_agent_id, runId: existingRun.run_id as string }
        }
      }
    }
  } catch (e) {
    console.warn('[pm-agent/launch] Failed to check existing agent status:', e instanceof Error ? e.message : e)
  }
  return { cursorAgentId: null, runId: null }
}

async function fetchConversationHistory(
  supabase: any,
  conversationId: string,
  projectId: string
): Promise<Array<{ role: string; content: string }>> {
  try {
    const { data, error } = await supabase
      .from('hal_conversation_messages')
      .select('role, content')
      .eq('project_id', projectId)
      .eq('agent', conversationId)
      .order('sequence', { ascending: true })
      .limit(50) // Limit to most recent 50 messages for context
    
    if (error) {
      console.warn('[pm-agent/launch] Failed to fetch conversation history:', error.message)
      return []
    }
    
    return (data || [])
      .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
      }))
  } catch (e) {
    console.warn('[pm-agent/launch] Error fetching conversation history:', e instanceof Error ? e.message : e)
    return []
  }
}

function buildPromptText(
  repoFullName: string,
  defaultBranch: string,
  halApiBaseUrl: string,
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>
): string {
  const parts = [
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
  
  if (conversationHistory && conversationHistory.length > 0) {
    parts.push('', '## Conversation history', '')
    for (const msg of conversationHistory) {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'
      parts.push(`${roleLabel}: ${msg.content}`, '')
    }
  }
  
  parts.push('**Current user message:**', message)
  
  return parts.join('\n')
}

async function createNewAgent(
  supabase: any,
  repoFullName: string,
  defaultBranch: string,
  message: string,
  halApiBaseUrl: string,
  auth: string,
  repoUrl: string,
  conversationHistory?: Array<{ role: string; content: string }>
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
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, `Launch failed: ${msg}`),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    throw new Error(msg)
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    const msg = 'Invalid response from Cursor API when launching agent.'
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, msg),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    throw new Error(msg)
  }

  const cursorAgentId = launchData.id ?? ''
  const cursorStatus = launchData.status ?? 'CREATING'
  if (!cursorAgentId) {
    const msg = 'Cursor API did not return an agent ID.'
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, msg),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
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
 * Uses gpt-5.2. When continuing a conversation, includes conversation history in the prompt.
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

    // Check for existing cursor_agent_id if conversationId and projectId are provided
    let existingCursorAgentId: string | null = null
    let isContinuing = false
    let existingRunId: string | null = null
    if (conversationId && projectId && !restart) {
      const existing = await checkExistingThread(supabase, conversationId, projectId, auth)
      if (existing.cursorAgentId && existing.runId) {
        existingCursorAgentId = existing.cursorAgentId
        existingRunId = existing.runId
        isContinuing = true
      }
    }

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

    // Fetch conversation history if continuing
    let conversationHistory: Array<{ role: string; content: string }> | undefined
    if (isContinuing && conversationId && projectId) {
      conversationHistory = await fetchConversationHistory(supabase, conversationId, projectId)
    }

    let cursorAgentId: string
    let cursorStatus: string
    let runId: string

    // Always create a new agent run (even when continuing) because Cursor API doesn't support
    // sending follow-up messages to existing agents. We include conversation history in the prompt
    // so the agent has context from previous turns.
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

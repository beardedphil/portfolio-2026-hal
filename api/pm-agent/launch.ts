import type { IncomingMessage, ServerResponse } from 'http'
import { getServerSupabase, getCursorApiKey, humanReadableCursorError, appendProgress, readJsonBody, json } from '../agent-runs/_shared.js'
import { getOrigin } from '../_lib/github/config.js'

const PM_CURSOR_MODEL = 'gpt-5.2'

async function getAgentStatus(cursorAgentId: string, auth: string): Promise<string | null> {
  try {
    const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!statusRes.ok) return null
    const statusData = (await statusRes.json()) as { status?: string }
    return statusData.status ?? null
  } catch (e) {
    console.warn('[pm-agent/launch] Failed to check existing agent status:', e instanceof Error ? e.message : e)
    return null
  }
}

async function findActiveRun(supabase: any, cursorAgentId: string): Promise<string | null> {
  const { data: existingRun } = await supabase
    .from('hal_agent_runs')
    .select('run_id, status')
    .eq('cursor_agent_id', cursorAgentId)
    .eq('agent_type', 'project-manager')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  
  if (existingRun?.run_id && existingRun.status === 'polling') {
    return existingRun.run_id as string
  }
  return null
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
  
  const status = await getAgentStatus(thread.cursor_agent_id, auth)
  if (status !== 'RUNNING' && status !== 'CREATING') {
    return { cursorAgentId: null, runId: null }
  }
  
  const runId = await findActiveRun(supabase, thread.cursor_agent_id)
  if (!runId) return { cursorAgentId: null, runId: null }
  
  return { cursorAgentId: thread.cursor_agent_id, runId }
}

function buildPromptText(repoFullName: string, defaultBranch: string, halApiBaseUrl: string, message: string): string {
  return [
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
    '',
    '**User message:**',
    message,
  ].join('\n')
}

async function createRunRow(supabase: any, repoFullName: string): Promise<string> {
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

  return runRow.run_id as string
}

async function updateRunOnError(supabase: any, runId: string, initialProgress: any[], error: string): Promise<void> {
  await supabase
    .from('hal_agent_runs')
    .update({
      status: 'failed',
      error,
      progress: appendProgress(initialProgress, error),
      finished_at: new Date().toISOString(),
    })
    .eq('run_id', runId)
}

async function launchCursorAgent(
  promptText: string,
  repoUrl: string,
  defaultBranch: string,
  auth: string
): Promise<{ id: string; status: string }> {
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
    throw new Error(humanReadableCursorError(launchRes.status, launchText))
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    throw new Error('Invalid response from Cursor API when launching agent.')
  }

  const cursorAgentId = launchData.id ?? ''
  if (!cursorAgentId) {
    throw new Error('Cursor API did not return an agent ID.')
  }

  return { id: cursorAgentId, status: launchData.status ?? 'CREATING' }
}

async function createNewAgent(
  supabase: any,
  repoFullName: string,
  defaultBranch: string,
  message: string,
  halApiBaseUrl: string,
  auth: string,
  repoUrl: string
): Promise<{ runId: string; cursorAgentId: string; cursorStatus: string }> {
  const initialProgress = appendProgress([], `Launching PM agent for ${repoFullName}`)
  let runId: string
  try {
    runId = await createRunRow(supabase, repoFullName)
  } catch (err) {
    throw err
  }

  const promptText = buildPromptText(repoFullName, defaultBranch, halApiBaseUrl, message)

  try {
    const { id: cursorAgentId, status: cursorStatus } = await launchCursorAgent(promptText, repoUrl, defaultBranch, auth)
    
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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err ?? 'Unknown error')
    const fullErrorMsg = errorMsg.startsWith('Launch failed:') ? errorMsg : `Launch failed: ${errorMsg}`
    await updateRunOnError(supabase, runId, initialProgress, fullErrorMsg)
    throw new Error(errorMsg)
  }
}

function parseRequestBody(body: unknown): {
  message: string
  repoFullName: string
  defaultBranch: string
  conversationId?: string
  projectId?: string
  restart?: boolean
} {
  const parsed = body as {
    message?: string
    repoFullName?: string
    defaultBranch?: string
    conversationId?: string
    projectId?: string
    restart?: boolean
  }

  return {
    message: typeof parsed.message === 'string' ? parsed.message.trim() : '',
    repoFullName: typeof parsed.repoFullName === 'string' ? parsed.repoFullName.trim() : '',
    defaultBranch: (typeof parsed.defaultBranch === 'string' ? parsed.defaultBranch.trim() : '') || 'main',
    conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId.trim() : undefined,
    projectId: typeof parsed.projectId === 'string' ? parsed.projectId.trim() : undefined,
    restart: parsed.restart === true,
  }
}

function validateRequest(message: string, repoFullName: string, restart: boolean): string | null {
  if (!restart && !message) {
    return 'message is required.'
  }
  if (!repoFullName) {
    return 'repoFullName is required. Connect a GitHub repo first.'
  }
  return null
}

async function handleRestart(supabase: any, conversationId: string, projectId: string, res: ServerResponse): Promise<void> {
  await supabase
    .from('hal_pm_conversation_threads')
    .delete()
    .eq('project_id', projectId)
    .eq('conversation_id', conversationId)
  json(res, 200, { success: true, message: 'Conversation thread mapping cleared' })
}

async function handleContinueExisting(
  existingRunId: string,
  existingCursorAgentId: string,
  conversationId: string | undefined,
  projectId: string | undefined,
  cursorAgentId: string,
  supabase: any,
  res: ServerResponse
): Promise<void> {
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
    runId: existingRunId,
    status: 'polling',
    cursorAgentId: existingCursorAgentId,
    isContinuing: true,
  })
}

/**
 * Launch a Cursor Cloud Agent for the Project Manager role.
 * Uses gpt-5.2; no conversation history — Cursor handles context from the repo.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = await readJsonBody(req)
    const { message, repoFullName, defaultBranch, conversationId, projectId, restart } = parseRequestBody(body)

    const validationError = validateRequest(message, repoFullName, restart)
    if (validationError) {
      json(res, 400, { error: validationError })
      return
    }

    const halApiBaseUrl = getOrigin(req)
    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')
    const repoUrl = `https://github.com/${repoFullName}`
    const supabase = getServerSupabase()

    // Handle restart request
    if (restart && conversationId && projectId) {
      await handleRestart(supabase, conversationId, projectId, res)
      return
    }

    // Check for existing thread
    let existingCursorAgentId: string | null = null
    let existingRunId: string | null = null
    if (conversationId && projectId) {
      const existing = await checkExistingThread(supabase, conversationId, projectId, auth)
      if (existing.cursorAgentId && existing.runId) {
        existingCursorAgentId = existing.cursorAgentId
        existingRunId = existing.runId
      }
    }

    // Continue existing or create new
    if (existingCursorAgentId && existingRunId) {
      await handleContinueExisting(existingRunId, existingCursorAgentId, conversationId, projectId, existingCursorAgentId, supabase, res)
      return
    }

    // Create new agent
    let cursorAgentId: string
    let cursorStatus: string
    let runId: string
    try {
      const result = await createNewAgent(supabase, repoFullName, defaultBranch, message, halApiBaseUrl, auth, repoUrl)
      runId = result.runId
      cursorAgentId = result.cursorAgentId
      cursorStatus = result.cursorStatus
    } catch (err) {
      const msg = err instanceof Error ? err.message : err ? String(err) : 'Unknown error'
      json(res, 200, { runId: '', status: 'failed', error: msg })
      return
    }

    // Store conversation thread mapping
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
      isContinuing: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : err ? String(err) : 'Unknown error'
    console.error('[pm-agent/launch] Error:', message)
    const isConfigError =
      /Supabase server env is missing|Cursor API is not configured/i.test(message)
    const statusCode = isConfigError ? 503 : 500
    json(res, statusCode, { error: isConfigError ? message : 'Launch failed. Check server logs.' })
  }
}

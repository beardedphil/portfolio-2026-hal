import type { IncomingMessage, ServerResponse } from 'http'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import { listBranches, ensureInitialCommit } from '../_lib/github/githubApi.js'
import { getOrigin } from '../_lib/github/config.js'
import {
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  upsertArtifact,
  readJsonBody,
  json,
  validateMethod,
} from './_shared.js'

export type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

type RequestBody = {
  agentType?: AgentType
  repoFullName?: string
  ticketNumber?: number
  defaultBranch?: string
  message?: string
  conversationId?: string
  projectId?: string
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
  model?: string
}

type ParsedRequest = {
  agentType: AgentType
  model: string
  repoFullName: string
  ticketNumber: number | null
  defaultBranch: string
  message: string
  conversationId: string
  projectId: string
  images: Array<{ dataUrl: string; filename: string; mimeType: string }> | undefined
}

type TicketData = {
  pk: string
  displayId: string
  bodyMd: string
  currentColumnId: string | null
}

type TicketContent = {
  goal: string
  deliverable: string
  criteria: string
}

/**
 * Determines agent type from request body, defaulting to 'implementation'.
 */
function determineAgentType(body: RequestBody): AgentType {
  if (body.agentType === 'qa') return 'qa'
  if (body.agentType === 'project-manager') return 'project-manager'
  if (body.agentType === 'process-review') return 'process-review'
  return 'implementation'
}

/**
 * Parses and validates request body, returning normalized values.
 */
function parseRequestBody(body: RequestBody): ParsedRequest {
  return {
    agentType: determineAgentType(body),
    model: (typeof body.model === 'string' ? body.model.trim() : '') || '',
    repoFullName: typeof body.repoFullName === 'string' ? body.repoFullName.trim() : '',
    ticketNumber: typeof body.ticketNumber === 'number' ? body.ticketNumber : null,
    defaultBranch: (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main',
    message: typeof body.message === 'string' ? body.message.trim() : '',
    conversationId: typeof body.conversationId === 'string' ? body.conversationId.trim() : '',
    projectId: typeof body.projectId === 'string' ? body.projectId.trim() : '',
    images: Array.isArray(body.images) ? body.images : undefined,
  }
}

/**
 * Validates request parameters based on agent type.
 */
function validateRequest(parsed: ParsedRequest, agentType: AgentType, res: ServerResponse): boolean {
  if (!parsed.repoFullName) {
    json(res, 400, { error: 'repoFullName is required.' })
    return false
  }

  const needsTicket = agentType === 'implementation' || agentType === 'qa' || agentType === 'process-review'
  if (needsTicket && (!parsed.ticketNumber || !Number.isFinite(parsed.ticketNumber))) {
    json(res, 400, { error: 'ticketNumber is required.' })
    return false
  }

  if (agentType === 'project-manager' && !parsed.message) {
    json(res, 400, { error: 'message is required for project-manager runs.' })
    return false
  }

  return true
}

/**
 * Fetches ticket data from Supabase.
 */
async function fetchTicket(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  ticketNumber: number
): Promise<{ data: TicketData | null; error: string | null }> {
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, ticket_number, display_id, body_md, kanban_column_id')
    .eq('repo_full_name', repoFullName)
    .eq('ticket_number', ticketNumber)
    .maybeSingle()

  if (ticketErr || !ticket?.pk) {
    return { data: null, error: `Ticket ${ticketNumber} not found for repo ${repoFullName}.` }
  }

  return {
    data: {
      pk: ticket.pk as string,
      displayId: (ticket as any).display_id ?? String(ticketNumber).padStart(4, '0'),
      bodyMd: String((ticket as any).body_md ?? ''),
      currentColumnId: (ticket as any).kanban_column_id as string | null,
    },
    error: null,
  }
}

/**
 * Moves QA ticket from QA column to Doing when QA agent starts.
 */
async function moveQATicketToDoing(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  ticketPk: string,
  displayId: string,
  currentColumnId: string | null
): Promise<void> {
  if (currentColumnId !== 'col-qa') return

  try {
    const { data: inColumn } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('repo_full_name', repoFullName)
      .eq('kanban_column_id', 'col-doing')
      .order('kanban_position', { ascending: false })
      .limit(1)

    if (inColumn) {
      const nextPosition = inColumn.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
      const movedAt = new Date().toISOString()
      const { error: updateErr } = await supabase
        .from('tickets')
        .update({ kanban_column_id: 'col-doing', kanban_position: nextPosition, kanban_moved_at: movedAt })
        .eq('pk', ticketPk)

      if (updateErr) {
        console.error(`[QA Agent] Failed to move ticket ${displayId} from QA to Doing:`, updateErr.message)
      }
    }
  } catch (moveErr) {
    console.error(`[QA Agent] Error moving ticket ${displayId} from QA to Doing:`, moveErr instanceof Error ? moveErr.message : String(moveErr))
  }
}

/**
 * Extracts ticket content (goal, deliverable, criteria) from markdown body.
 */
function extractTicketContent(bodyMd: string): TicketContent {
  const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)

  return {
    goal: (goalMatch?.[1] ?? '').trim(),
    deliverable: (deliverableMatch?.[1] ?? '').trim(),
    criteria: (criteriaMatch?.[1] ?? '').trim(),
  }
}

/**
 * Generates prompt text for implementation agent.
 */
function buildImplementationPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  content: TicketContent
): string {
  return [
    'Implement this ticket.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: implementation`,
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketNumber**: ${ticketNumber}`,
    `- **displayId**: ${displayId}`,
    `- **currentColumnId**: ${currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${defaultBranch}`,
    `- **HAL API base URL**: ${halApiBaseUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required): `POST /api/artifacts/insert-implementation`, `POST /api/artifacts/get`, `POST /api/tickets/move`.',
    '',
    '## MANDATORY first step: pull latest from main',
    '',
    '**Before starting any work**, pull the latest code. Do not assume you have the latest code.',
    'Run: `git checkout main && git pull origin main`',
    'Then create or checkout your feature branch and proceed.',
    '',
    '## Ticket',
    `**ID**: ${displayId}`,
    `**Repo**: ${repoFullName}`,
    '',
    '## Goal',
    content.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    content.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    content.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Generates prompt text for QA agent.
 */
function buildQAPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  content: TicketContent
): string {
  return [
    'QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: qa`,
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketNumber**: ${ticketNumber}`,
    `- **displayId**: ${displayId}`,
    `- **currentColumnId**: ${currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${defaultBranch}`,
    `- **HAL API base URL**: ${halApiBaseUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required): `POST /api/artifacts/insert-qa`, `POST /api/artifacts/get`, `POST /api/tickets/move`.',
    '',
    '## MANDATORY first step: pull latest from main',
    '',
    '**Before starting any QA work**, pull the latest code. Do not assume you have the latest code.',
    'Run: `git checkout main && git pull origin main`',
    '',
    '## MANDATORY: Load Your Instructions First',
    '',
    '**BEFORE starting any QA work, you MUST load your basic instructions from Supabase.**',
    '',
    '**Step 1: Load basic instructions:**',
    '```javascript',
    'const baseUrl = process.env.HAL_API_URL || \'http://localhost:5173\'',
    'const res = await fetch(`${baseUrl}/api/instructions/get`, {',
    '  method: \'POST\',',
    '  headers: { \'Content-Type\': \'application/json\' },',
    '  body: JSON.stringify({',
    '    agentType: \'qa\',',
    '    includeBasic: true,',
    '    includeSituational: false,',
    '  }),',
    '})',
    'const result = await res.json()',
    'if (result.success) {',
    '  // result.instructions contains your basic instructions',
    '  // These include all mandatory workflows, QA report requirements, and procedures',
    '  // READ AND FOLLOW THESE INSTRUCTIONS - they contain critical requirements',
    '}',
    '```',
    '',
    '**The instructions from Supabase contain:**',
    '- Required implementation artifacts you must verify before starting QA',
    '- How to structure and store QA reports',
    '- When to pass/fail tickets',
    '- How to move tickets after QA',
    '- Code citation requirements',
    '- All other mandatory QA workflows',
    '',
    '**DO NOT proceed with QA until you have loaded and read your instructions from Supabase.**',
    '',
    '## Ticket',
    `**ID**: ${displayId}`,
    `**Repo**: ${repoFullName}`,
    '',
    '## Goal',
    content.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    content.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    content.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Creates a run row for project-manager agent.
 */
async function createProjectManagerRun(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  parsed: ParsedRequest
): Promise<{ runId: string | null; error: string | null }> {
  const openaiModel =
    process.env.OPENAI_PM_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const initialProgress = appendProgress([], `Launching project-manager run for ${repoFullName}`)
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
        message: parsed.message,
        conversationId: parsed.conversationId || null,
        projectId: parsed.projectId || null,
        defaultBranch: parsed.defaultBranch,
        images: parsed.images ?? null,
      },
    })
    .select('run_id')
    .maybeSingle()

  if (runInsErr || !runRow?.run_id) {
    return { runId: null, error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` }
  }

  return { runId: runRow.run_id as string, error: null }
}

/**
 * Creates a run row for process-review agent.
 */
async function createProcessReviewRun(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  ticketPk: string,
  ticketNumber: number,
  displayId: string
): Promise<{ runId: string | null; error: string | null }> {
  const openaiModel =
    process.env.OPENAI_PROCESS_REVIEW_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.2'
  const initialProgress = appendProgress([], `Launching process-review run for ${displayId}`)
  const { data: runRow, error: runInsErr } = await supabase
    .from('hal_agent_runs')
    .insert({
      agent_type: 'process-review',
      repo_full_name: repoFullName,
      ticket_pk: ticketPk,
      ticket_number: ticketNumber,
      display_id: displayId,
      provider: 'openai',
      model: openaiModel,
      status: 'created',
      current_stage: 'preparing',
      progress: initialProgress,
    })
    .select('run_id')
    .maybeSingle()

  if (runInsErr || !runRow?.run_id) {
    return { runId: null, error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` }
  }

  return { runId: runRow.run_id as string, error: null }
}

/**
 * Creates a run row for implementation or QA agent.
 */
async function createCursorRun(
  supabase: SupabaseClient<any, 'public', any>,
  agentType: AgentType,
  repoFullName: string,
  ticketPk: string,
  ticketNumber: number,
  displayId: string
): Promise<{ runId: string | null; error: string | null }> {
  const initialProgress = appendProgress([], `Launching ${agentType} run for ${displayId}`)
  const { data: runRow, error: runInsErr } = await supabase
    .from('hal_agent_runs')
    .insert({
      agent_type: agentType,
      repo_full_name: repoFullName,
      ticket_pk: ticketPk,
      ticket_number: ticketNumber,
      display_id: displayId,
      provider: 'cursor',
      status: 'launching',
      current_stage: 'preparing',
      progress: initialProgress,
    })
    .select('run_id')
    .maybeSingle()

  if (runInsErr || !runRow?.run_id) {
    return { runId: null, error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` }
  }

  return { runId: runRow.run_id as string, error: null }
}

/**
 * Updates run stage in Supabase.
 */
async function updateRunStage(
  supabase: SupabaseClient<any, 'public', any>,
  runId: string,
  stage: string,
  progress: any[],
  message?: string
): Promise<void> {
  await supabase
    .from('hal_agent_runs')
    .update({
      current_stage: stage,
      progress: message ? appendProgress(progress, message) : progress,
    })
    .eq('run_id', runId)
}

/**
 * Ensures repository has at least one branch by creating initial commit if needed.
 */
async function ensureRepositoryBootstrap(
  req: IncomingMessage,
  res: ServerResponse,
  repoFullName: string,
  defaultBranch: string,
  runId: string,
  initialProgress: any[],
  supabase: SupabaseClient<any, 'public', any>
): Promise<{ success: boolean; error?: string }> {
  let ghToken: string | undefined
  try {
    const session = await getSession(req, res)
    ghToken = session.github?.accessToken
  } catch (sessionErr) {
    console.warn('[agent-runs/launch] Session unavailable (missing AUTH_SESSION_SECRET?):', sessionErr instanceof Error ? sessionErr.message : sessionErr)
  }

  if (!ghToken) return { success: true }

  const branchesResult = await listBranches(ghToken, repoFullName)
  if ('branches' in branchesResult && branchesResult.branches.length === 0) {
    const bootstrap = await ensureInitialCommit(ghToken, repoFullName, defaultBranch)
    if ('error' in bootstrap) {
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: `Repository has no branches and initial commit failed: ${bootstrap.error}. Ensure you have push access and try again.`,
          progress: appendProgress(initialProgress, `Bootstrap failed: ${bootstrap.error}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      return { success: false, error: bootstrap.error }
    }
  }

  return { success: true }
}

/**
 * Finds existing PR URL for a ticket.
 */
async function findExistingPR(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string
): Promise<string | null> {
  const { data: linked } = await supabase
    .from('hal_agent_runs')
    .select('pr_url, created_at')
    .eq('ticket_pk', ticketPk)
    .not('pr_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  const prUrl = Array.isArray(linked) && linked.length ? (linked[0] as any)?.pr_url : null
  return typeof prUrl === 'string' && prUrl.trim() ? prUrl.trim() : null
}

/**
 * Launches Cursor agent and handles response.
 */
async function launchCursorAgent(
  agentType: AgentType,
  repoFullName: string,
  ticketNumber: number,
  defaultBranch: string,
  promptText: string,
  existingPrUrl: string | null,
  model: string
): Promise<{ success: boolean; agentId?: string; status?: string; error?: string }> {
  const cursorKey = getCursorApiKey()
  const auth = Buffer.from(`${cursorKey}:`).toString('base64')
  const repoUrl = `https://github.com/${repoFullName}`
  const branchName =
    agentType === 'implementation'
      ? `ticket/${String(ticketNumber).padStart(4, '0')}-implementation`
      : defaultBranch

  const target =
    agentType === 'implementation'
      ? existingPrUrl
        ? { branchName }
        : { autoCreatePr: true, branchName }
      : { branchName: defaultBranch }

  const promptTextForLaunch =
    agentType === 'implementation' && existingPrUrl
      ? `${promptText}\n\n## Existing PR linked\n\nA PR is already linked to this ticket:\n\n- ${existingPrUrl}\n\nDo NOT create a new PR. Push changes to the branch above so the existing PR updates.`
      : promptText

  const launchRes = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: { text: promptTextForLaunch },
      source: { repository: repoUrl, ref: defaultBranch },
      target,
      ...(model ? { model } : {}),
    }),
  })

  const launchText = await launchRes.text()
  if (!launchRes.ok) {
    const branchNotFound =
      launchRes.status === 400 &&
      (/branch\s+.*\s+does not exist/i.test(launchText) || /does not exist.*branch/i.test(launchText))
    const msg = branchNotFound
      ? `The repository has no "${defaultBranch}" branch yet. If the repo is new and empty, create an initial commit and push (e.g. add a README) so the default branch exists, then try again.`
      : humanReadableCursorError(launchRes.status, launchText)
    return { success: false, error: msg }
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    return { success: false, error: 'Invalid response from Cursor API when launching agent.' }
  }

  const cursorAgentId = launchData.id
  const cursorStatus = launchData.status ?? 'CREATING'
  if (!cursorAgentId) {
    return { success: false, error: 'Cursor API did not return an agent ID.' }
  }

  return { success: true, agentId: cursorAgentId, status: cursorStatus }
}

/**
 * Updates run with failed status and error message.
 */
async function markRunAsFailed(
  supabase: SupabaseClient<any, 'public', any>,
  runId: string,
  error: string,
  initialProgress: any[]
): Promise<void> {
  await supabase
    .from('hal_agent_runs')
    .update({
      status: 'failed',
      current_stage: 'failed',
      error,
      progress: appendProgress(initialProgress, `Launch failed: ${error}`),
      finished_at: new Date().toISOString(),
    })
    .eq('run_id', runId)
}

/**
 * Creates initial worklog artifact for implementation runs.
 */
async function createInitialWorklog(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  repoFullName: string,
  displayId: string,
  progress: any[],
  cursorStatus: string
): Promise<void> {
  try {
    const worklogTitle = `Worklog for ticket ${displayId}`
    const worklogLines = [
      `# Worklog: ${displayId}`,
      '',
      '## Progress',
      ...(Array.isArray(progress) ? progress : []).map(
        (p: { at: string; message: string }) => `- **${p.at}** — ${p.message}`
      ),
      '',
      `**Current status:** ${cursorStatus}`,
    ]
    const res = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', worklogTitle, worklogLines.join('\n'))
    if (!res.ok) console.warn('[agent-runs] launch worklog upsert failed:', (res as { ok: false; error: string }).error)
  } catch (e) {
    console.warn('[agent-runs] launch worklog upsert error:', e instanceof Error ? e.message : e)
  }
}

/**
 * Handles project-manager agent launch.
 */
async function handleProjectManagerLaunch(
  supabase: SupabaseClient<any, 'public', any>,
  parsed: ParsedRequest,
  res: ServerResponse
): Promise<boolean> {
  const result = await createProjectManagerRun(supabase, parsed.repoFullName, parsed)
  if (result.error) {
    json(res, 500, { error: result.error })
    return false
  }
  json(res, 200, { runId: result.runId, status: 'created', provider: 'openai' })
  return true
}

/**
 * Handles process-review agent launch.
 */
async function handleProcessReviewLaunch(
  supabase: SupabaseClient<any, 'public', any>,
  parsed: ParsedRequest,
  ticket: TicketData,
  res: ServerResponse
): Promise<boolean> {
  const result = await createProcessReviewRun(supabase, parsed.repoFullName, ticket.pk, parsed.ticketNumber!, ticket.displayId)
  if (result.error) {
    json(res, 500, { error: result.error })
    return false
  }
  json(res, 200, { runId: result.runId, status: 'created', provider: 'openai' })
  return true
}

/**
 * Handles implementation/QA agent launch with Cursor.
 */
async function handleCursorAgentLaunch(
  req: IncomingMessage,
  res: ServerResponse,
  supabase: SupabaseClient<any, 'public', any>,
  parsed: ParsedRequest,
  agentType: AgentType,
  ticket: TicketData,
  content: TicketContent,
  halApiBaseUrl: string
): Promise<void> {
  const promptText =
    agentType === 'implementation'
      ? buildImplementationPrompt(
          parsed.repoFullName,
          parsed.ticketNumber!,
          ticket.displayId,
          ticket.currentColumnId,
          parsed.defaultBranch,
          halApiBaseUrl,
          content
        )
      : buildQAPrompt(
          parsed.repoFullName,
          parsed.ticketNumber!,
          ticket.displayId,
          ticket.currentColumnId,
          parsed.defaultBranch,
          halApiBaseUrl,
          content
        )

  const runResult = await createCursorRun(supabase, agentType, parsed.repoFullName, ticket.pk, parsed.ticketNumber!, ticket.displayId)
  if (runResult.error) {
    json(res, 500, { error: runResult.error })
    return
  }

  const runId = runResult.runId!
  const initialProgress = appendProgress([], `Launching ${agentType} run for ${ticket.displayId}`)

  await updateRunStage(supabase, runId, 'fetching_ticket', initialProgress, 'Fetching ticket...')

  if (agentType === 'qa') {
    const branchMatch = ticket.bodyMd.match(/##\s*QA[^\n]*\n[\s\S]*?Branch[:\s]+([^\n]+)/i)
    const branchName = branchMatch?.[1]?.trim()
    await updateRunStage(supabase, runId, 'fetching_branch', initialProgress, branchName ? `Finding branch: ${branchName}` : undefined)
  }

  if (agentType === 'implementation') {
    await updateRunStage(supabase, runId, 'resolving_repo', initialProgress, 'Resolving repository...')
  }

  try {
    const bootstrapResult = await ensureRepositoryBootstrap(
      req,
      res,
      parsed.repoFullName,
      parsed.defaultBranch,
      runId,
      initialProgress,
      supabase
    )
    if (!bootstrapResult.success) {
      json(res, 200, { runId, status: 'failed', error: bootstrapResult.error })
      return
    }
  } catch (bootstrapErr) {
    const errorMsg = bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr)
    await markRunAsFailed(supabase, runId, errorMsg, initialProgress)
    json(res, 200, { runId, status: 'failed', error: errorMsg })
    return
  }

  await updateRunStage(supabase, runId, 'launching', initialProgress, 'Launching agent...')
  await supabase.from('hal_agent_runs').update({ status: 'launching' }).eq('run_id', runId)

  const existingPrUrl = agentType === 'implementation' ? await findExistingPR(supabase, ticket.pk) : null

  const launchResult = await launchCursorAgent(
    agentType,
    parsed.repoFullName,
    parsed.ticketNumber!,
    parsed.defaultBranch,
    promptText,
    existingPrUrl,
    parsed.model
  )

  if (!launchResult.success) {
    await markRunAsFailed(supabase, runId, launchResult.error!, initialProgress)
    json(res, 200, { runId, status: 'failed', error: launchResult.error })
    return
  }

  const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${launchResult.status}).`)
  const nextStage = agentType === 'implementation' ? 'running' : 'reviewing'
  await supabase
    .from('hal_agent_runs')
    .update({
      status: 'polling',
      current_stage: nextStage,
      cursor_agent_id: launchResult.agentId,
      cursor_status: launchResult.status,
      progress: progressAfterLaunch,
    })
    .eq('run_id', runId)

  if (agentType === 'implementation') {
    await createInitialWorklog(supabase, ticket.pk, parsed.repoFullName, ticket.displayId, progressAfterLaunch, launchResult.status!)
  }

  json(res, 200, { runId, status: 'polling', cursorAgentId: launchResult.agentId })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!validateMethod(req, res, 'POST')) {
    return
  }

  try {
    const body = (await readJsonBody(req)) as RequestBody
    const parsed = parseRequestBody(body)
    const agentType = parsed.agentType

    if (!validateRequest(parsed, agentType, res)) {
      return
    }

    const supabase = getServerSupabase()

    if (agentType === 'project-manager') {
      await handleProjectManagerLaunch(supabase, parsed, res)
      return
    }

    const ticketResult = await fetchTicket(supabase, parsed.repoFullName, parsed.ticketNumber!)
    if (ticketResult.error) {
      json(res, 404, { error: ticketResult.error })
      return
    }

    const ticket = ticketResult.data!
    const halApiBaseUrl = getOrigin(req)

    if (agentType === 'qa') {
      await moveQATicketToDoing(supabase, parsed.repoFullName, ticket.pk, ticket.displayId, ticket.currentColumnId)
    }

    const content = extractTicketContent(ticket.bodyMd)

    if (agentType === 'process-review') {
      await handleProcessReviewLaunch(supabase, parsed, ticket, res)
      return
    }

    await handleCursorAgentLaunch(req, res, supabase, parsed, agentType, ticket, content, halApiBaseUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[agent-runs/launch] Error:', message, stack ?? '')
    const isConfigError =
      /Supabase server env is missing|Cursor API is not configured|Missing .* in environment/i.test(message)
    const statusCode = isConfigError ? 503 : 500
    const safeMessage = message.slice(0, 500)
    json(res, statusCode, { error: safeMessage })
  }
}

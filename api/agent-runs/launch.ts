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

type TicketData = {
  pk: string
  displayId: string
  bodyMd: string
  currentColumnId: string | null
}

type TicketSections = {
  goal: string
  deliverable: string
  criteria: string
}

/**
 * Extracts ticket sections (Goal, Human-verifiable deliverable, Acceptance criteria) from markdown body.
 */
function extractTicketSections(bodyMd: string): TicketSections {
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
 * Builds prompt text for implementation agent.
 */
function buildImplementationPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  sections: TicketSections
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
    sections.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    sections.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    sections.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Builds prompt text for QA agent.
 */
function buildQAPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  sections: TicketSections
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
    sections.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    sections.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    sections.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Moves QA ticket from col-qa to col-doing when QA agent starts.
 */
async function moveQATicketToDoing(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  ticketPk: string,
  displayId: string
): Promise<void> {
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
 * Updates run stage in database.
 */
async function updateRunStage(
  supabase: SupabaseClient<any, 'public', any>,
  runId: string,
  stage: string,
  progress: any[],
  additionalUpdates?: Record<string, unknown>
): Promise<void> {
  await supabase
    .from('hal_agent_runs')
    .update({
      current_stage: stage,
      progress,
      ...additionalUpdates,
    })
    .eq('run_id', runId)
}

/**
 * Checks if a PR is already linked to the ticket.
 */
async function getExistingPrUrl(
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
 * Ensures repository has at least one branch by creating initial commit if needed.
 */
async function ensureRepoHasBranch(
  req: IncomingMessage,
  res: ServerResponse,
  repoFullName: string,
  defaultBranch: string,
  supabase: SupabaseClient<any, 'public', any>,
  runId: string,
  initialProgress: any[]
): Promise<{ success: true } | { error: string }> {
  let ghToken: string | undefined
  try {
    const session = await getSession(req, res)
    ghToken = session.github?.accessToken
  } catch (sessionErr) {
    console.warn('[agent-runs/launch] Session unavailable (missing AUTH_SESSION_SECRET?):', sessionErr instanceof Error ? sessionErr.message : sessionErr)
  }
  
  if (!ghToken) {
    return { success: true }
  }

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
      return { error: bootstrap.error }
    }
  }
  return { success: true }
}

/**
 * Launches Cursor agent and handles response.
 */
async function launchCursorAgent(
  promptText: string,
  repoUrl: string,
  defaultBranch: string,
  target: { branchName: string } | { autoCreatePr: true; branchName: string },
  model: string
): Promise<{ success: true; agentId: string; status: string } | { error: string; statusCode?: number }> {
  const cursorKey = getCursorApiKey()
  const auth = Buffer.from(`${cursorKey}:`).toString('base64')

  const launchRes = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: { text: promptText },
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
    return { error: msg, statusCode: launchRes.status }
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    return { error: 'Invalid response from Cursor API when launching agent.' }
  }

  const cursorAgentId = launchData.id
  const cursorStatus = launchData.status ?? 'CREATING'
  if (!cursorAgentId) {
    return { error: 'Cursor API did not return an agent ID.' }
  }

  return { success: true, agentId: cursorAgentId, status: cursorStatus }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!validateMethod(req, res, 'POST')) {
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      agentType?: AgentType
      repoFullName?: string
      ticketNumber?: number
      /** Default branch for the repo (e.g. "main"). Used when repo has no branches yet. */
      defaultBranch?: string
      // For QA: optionally provide branch hint (still read from ticket body if present)
      message?: string
      // PM only: optional conversation routing + attachments
      conversationId?: string
      projectId?: string
      images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
      /** Optional Cursor Cloud Agent model (e.g. "claude-4-sonnet", "gpt-5.2"). Omit for auto-selection. */
      model?: string
    }

    const agentType: AgentType =
      body.agentType === 'qa'
        ? 'qa'
        : body.agentType === 'project-manager'
          ? 'project-manager'
          : body.agentType === 'process-review'
            ? 'process-review'
            : 'implementation'
    // Implementation and QA: do not send model — let Cursor auto-select.
    const model = (typeof body.model === 'string' ? body.model.trim() : '') || ''
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const ticketNumber = typeof body.ticketNumber === 'number' ? body.ticketNumber : null
    // Use connected repo's default branch (empty repos have no branches until first push)
    const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const images = Array.isArray(body.images) ? body.images : undefined

    if (!repoFullName) {
      json(res, 400, { error: 'repoFullName is required.' })
      return
    }

    const needsTicket = agentType === 'implementation' || agentType === 'qa' || agentType === 'process-review'
    if (needsTicket && (!ticketNumber || !Number.isFinite(ticketNumber))) {
      json(res, 400, { error: 'ticketNumber is required.' })
      return
    }
    if (agentType === 'project-manager' && !message) {
      json(res, 400, { error: 'message is required for project-manager runs.' })
      return
    }

    const supabase = getServerSupabase()

    // Project Manager (OpenAI) is async/streamed via agent-runs/work + agent-runs/stream.
    if (agentType === 'project-manager') {
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
      json(res, 200, { runId: runRow.run_id, status: 'created', provider: 'openai' })
      return
    }

    // Fetch ticket (repo-scoped 0079)
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, ticket_number, display_id, body_md, kanban_column_id')
      .eq('repo_full_name', repoFullName)
      .eq('ticket_number', ticketNumber)
      .maybeSingle()
    if (ticketErr || !ticket?.pk) {
      json(res, 404, { error: `Ticket ${ticketNumber} not found for repo ${repoFullName}.` })
      return
    }

    const ticketData: TicketData = {
      pk: ticket.pk as string,
      displayId: (ticket as any).display_id ?? String(ticketNumber).padStart(4, '0'),
      bodyMd: String((ticket as any).body_md ?? ''),
      currentColumnId: (ticket as any).kanban_column_id as string | null,
    }

    const halApiBaseUrl = getOrigin(req)

    // Move QA ticket from QA column to Doing when QA agent starts (0088)
    if (agentType === 'qa' && ticketData.currentColumnId === 'col-qa') {
      await moveQATicketToDoing(supabase, repoFullName, ticketData.pk, ticketData.displayId)
    }

    // Extract ticket sections
    const sections = extractTicketSections(ticketData.bodyMd)

    // Process Review (OpenAI) launch: just create run row; /work will generate streamed output.
    if (agentType === 'process-review') {
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
        json(res, 500, { error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` })
        return
      }

      json(res, 200, { runId: runRow.run_id, status: 'created', provider: 'openai' })
      return
    }

    // Build prompt based on agent type
    const promptText =
      agentType === 'implementation'
        ? buildImplementationPrompt(
            repoFullName,
            ticketNumber,
            ticketData.displayId,
            ticketData.currentColumnId,
            defaultBranch,
            halApiBaseUrl,
            sections
          )
        : buildQAPrompt(
            repoFullName,
            ticketNumber,
            ticketData.displayId,
            ticketData.currentColumnId,
            defaultBranch,
            halApiBaseUrl,
            sections
          )

    // Create run row - start with 'preparing' stage (0690)
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
      json(res, 500, { error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` })
      return
    }

    const runId = runRow.run_id as string

    // Update stage to 'fetching_ticket' (0690) - ticket was fetched before run creation
    await updateRunStage(supabase, runId, 'fetching_ticket', appendProgress(initialProgress, 'Fetching ticket...'))

    // For QA: update to 'fetching_branch' stage (0690)
    if (agentType === 'qa') {
      const branchMatch = ticketData.bodyMd.match(/##\s*QA[^\n]*\n[\s\S]*?Branch[:\s]+([^\n]+)/i)
      const branchName = branchMatch?.[1]?.trim()
      const progress = branchName
        ? appendProgress(initialProgress, `Finding branch: ${branchName}`)
        : initialProgress
      await updateRunStage(supabase, runId, 'fetching_branch', progress)
    }

    // For implementation: update to 'resolving_repo' stage (0690)
    if (agentType === 'implementation') {
      await updateRunStage(
        supabase,
        runId,
        'resolving_repo',
        appendProgress(initialProgress, 'Resolving repository...')
      )
    }

    // Ensure repository has at least one branch
    const repoCheck = await ensureRepoHasBranch(req, res, repoFullName, defaultBranch, supabase, runId, initialProgress)
    if ('error' in repoCheck) {
      json(res, 200, { runId, status: 'failed', error: repoCheck.error })
      return
    }

    // Update stage to 'launching' (0690)
    await updateRunStage(
      supabase,
      runId,
      'launching',
      appendProgress(initialProgress, 'Launching agent...'),
      { status: 'launching' }
    )

    // Check for existing PR and prepare launch target
    const repoUrl = `https://github.com/${repoFullName}`
    const branchName =
      agentType === 'implementation'
        ? `ticket/${String(ticketNumber).padStart(4, '0')}-implementation`
        : defaultBranch
    const existingPrUrl = agentType === 'implementation' ? await getExistingPrUrl(supabase, ticketData.pk) : null
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

    // Launch Cursor agent
    const launchResult = await launchCursorAgent(promptTextForLaunch, repoUrl, defaultBranch, target, model)
    if ('error' in launchResult) {
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: launchResult.error,
          progress: appendProgress(initialProgress, `Launch failed: ${launchResult.error}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: launchResult.error })
      return
    }

    const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${launchResult.status}).`)
    // Update stage to 'polling' (or 'running' for implementation, 'reviewing' for QA) (0690)
    const nextStage = agentType === 'implementation' ? 'running' : 'reviewing'
    await updateRunStage(supabase, runId, nextStage, progressAfterLaunch, {
      status: 'polling',
      cursor_agent_id: launchResult.agentId,
      cursor_status: launchResult.status,
    })

    // Create/update worklog artifact so it exists from the start (implementation runs only)
    if (agentType === 'implementation' && ticketData.pk && repoFullName) {
      try {
        const worklogTitle = `Worklog for ticket ${ticketData.displayId}`
        const worklogLines = [
          `# Worklog: ${ticketData.displayId}`,
          '',
          '## Progress',
          ...(Array.isArray(progressAfterLaunch) ? progressAfterLaunch : []).map(
            (p: { at: string; message: string }) => `- **${p.at}** — ${p.message}`
          ),
          '',
          `**Current status:** ${launchResult.status}`,
        ]
        const artifactRes = await upsertArtifact(
          supabase,
          ticketData.pk,
          repoFullName,
          'implementation',
          worklogTitle,
          worklogLines.join('\n')
        )
        if (!artifactRes.ok) {
          console.warn('[agent-runs] launch worklog upsert failed:', (artifactRes as { ok: false; error: string }).error)
        }
      } catch (e) {
        console.warn('[agent-runs] launch worklog upsert error:', e instanceof Error ? e.message : e)
      }
    }

    json(res, 200, { runId, status: 'polling', cursorAgentId: launchResult.agentId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[agent-runs/launch] Error:', message, stack ?? '')
    // Return 503 for config errors so the UI can show a clear message
    const isConfigError =
      /Supabase server env is missing|Cursor API is not configured|Missing .* in environment/i.test(message)
    const statusCode = isConfigError ? 503 : 500
    // Always return the real error message so the UI can display it (no stack or internal details)
    const safeMessage = message.slice(0, 500)
    json(res, statusCode, { error: safeMessage })
  }
}


import type { IncomingMessage, ServerResponse } from 'http'
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

type ParsedBody = {
  agentType: AgentType
  model: string
  repoFullName: string
  ticketNumber: number | null
  defaultBranch: string
  message: string
  conversationId: string
  projectId: string
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
}

type TicketData = {
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
 * Parses and normalizes request body fields.
 */
function parseRequestBody(body: RequestBody): ParsedBody {
  const agentType = determineAgentType(body)
  const model = (typeof body.model === 'string' ? body.model.trim() : '') || ''
  const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
  const ticketNumber = typeof body.ticketNumber === 'number' ? body.ticketNumber : null
  const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  const images = Array.isArray(body.images) ? body.images : undefined

  return {
    agentType,
    model,
    repoFullName,
    ticketNumber,
    defaultBranch,
    message,
    conversationId,
    projectId,
    images,
  }
}

/**
 * Validates request body and returns error message if invalid.
 */
function validateRequest(parsed: ParsedBody): string | null {
  if (!parsed.repoFullName) {
    return 'repoFullName is required.'
  }

  const needsTicket = parsed.agentType === 'implementation' || parsed.agentType === 'qa' || parsed.agentType === 'process-review'
  if (needsTicket && (!parsed.ticketNumber || !Number.isFinite(parsed.ticketNumber))) {
    return 'ticketNumber is required.'
  }

  if (parsed.agentType === 'project-manager' && !parsed.message) {
    return 'message is required for project-manager runs.'
  }

  return null
}

/**
 * Extracts goal, deliverable, and criteria from ticket body markdown.
 */
function parseTicketBody(bodyMd: string): TicketData {
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
 * Builds implementation agent prompt text.
 */
function buildImplementationPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  ticketData: TicketData
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
    ticketData.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    ticketData.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    ticketData.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Builds QA agent prompt text.
 */
function buildQAPrompt(
  repoFullName: string,
  ticketNumber: number,
  displayId: string,
  currentColumnId: string | null,
  defaultBranch: string,
  halApiBaseUrl: string,
  ticketData: TicketData
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
    ticketData.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    ticketData.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    ticketData.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Moves QA ticket from QA column to Doing when QA agent starts.
 */
async function moveQATicketToDoing(
  supabase: ReturnType<typeof getServerSupabase>,
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!validateMethod(req, res, 'POST')) {
    return
  }

  try {
    const body = (await readJsonBody(req)) as RequestBody
    const parsed = parseRequestBody(body)

    const validationError = validateRequest(parsed)
    if (validationError) {
      json(res, 400, { error: validationError })
      return
    }

    const supabase = getServerSupabase()

    // Project Manager (OpenAI) is async/streamed via agent-runs/work + agent-runs/stream.
    if (parsed.agentType === 'project-manager') {
      const openaiModel =
        process.env.OPENAI_PM_MODEL?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        'gpt-5.2'
      const initialProgress = appendProgress([], `Launching project-manager run for ${parsed.repoFullName}`)
      const { data: runRow, error: runInsErr } = await supabase
        .from('hal_agent_runs')
        .insert({
          agent_type: 'project-manager',
          repo_full_name: parsed.repoFullName,
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
      .eq('repo_full_name', parsed.repoFullName)
      .eq('ticket_number', parsed.ticketNumber)
      .maybeSingle()
    if (ticketErr || !ticket?.pk) {
      json(res, 404, { error: `Ticket ${parsed.ticketNumber} not found for repo ${parsed.repoFullName}.` })
      return
    }

    const ticketPk = ticket.pk as string
    const displayId = (ticket as any).display_id ?? String(parsed.ticketNumber).padStart(4, '0')
    const bodyMd = String((ticket as any).body_md ?? '')
    const currentColumnId = (ticket as any).kanban_column_id as string | null

    const halApiBaseUrl = getOrigin(req)

    // Move QA ticket from QA column to Doing when QA agent starts (0088)
    if (parsed.agentType === 'qa' && currentColumnId === 'col-qa') {
      await moveQATicketToDoing(supabase, parsed.repoFullName, ticketPk, displayId)
    }

    // Parse ticket body
    const ticketData = parseTicketBody(bodyMd)

    // Process Review (OpenAI) launch: just create run row; /work will generate streamed output.
    if (parsed.agentType === 'process-review') {
      const openaiModel =
        process.env.OPENAI_PROCESS_REVIEW_MODEL?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        'gpt-5.2'
      const initialProgress = appendProgress([], `Launching process-review run for ${displayId}`)
      const { data: runRow, error: runInsErr } = await supabase
        .from('hal_agent_runs')
        .insert({
          agent_type: 'process-review',
          repo_full_name: parsed.repoFullName,
          ticket_pk: ticketPk,
          ticket_number: parsed.ticketNumber,
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
      parsed.agentType === 'implementation'
        ? buildImplementationPrompt(
            parsed.repoFullName,
            parsed.ticketNumber!,
            displayId,
            currentColumnId,
            parsed.defaultBranch,
            halApiBaseUrl,
            ticketData
          )
        : buildQAPrompt(
            parsed.repoFullName,
            parsed.ticketNumber!,
            displayId,
            currentColumnId,
            parsed.defaultBranch,
            halApiBaseUrl,
            ticketData
          )

    // Create run row - start with 'preparing' stage (0690)
    const initialProgress = appendProgress([], `Launching ${parsed.agentType} run for ${displayId}`)
    const { data: runRow, error: runInsErr } = await supabase
      .from('hal_agent_runs')
      .insert({
        agent_type: parsed.agentType,
        repo_full_name: parsed.repoFullName,
        ticket_pk: ticketPk,
        ticket_number: parsed.ticketNumber,
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
    await supabase
      .from('hal_agent_runs')
      .update({
        current_stage: 'fetching_ticket',
        progress: appendProgress(initialProgress, 'Fetching ticket...'),
      })
      .eq('run_id', runId)

    // For QA: update to 'fetching_branch' stage (0690)
    // Extract branch name from ticket body for QA
    if (parsed.agentType === 'qa') {
      const branchMatch = bodyMd.match(/##\s*QA[^\n]*\n[\s\S]*?Branch[:\s]+([^\n]+)/i)
      const branchName = branchMatch?.[1]?.trim()
      if (branchName) {
        await supabase
          .from('hal_agent_runs')
          .update({
            current_stage: 'fetching_branch',
            progress: appendProgress(initialProgress, `Finding branch: ${branchName}`),
          })
          .eq('run_id', runId)
      } else {
        await supabase
          .from('hal_agent_runs')
          .update({ current_stage: 'fetching_branch' })
          .eq('run_id', runId)
      }
    }

    // For implementation: update to 'resolving_repo' stage (0690)
    if (parsed.agentType === 'implementation') {
      await supabase
        .from('hal_agent_runs')
        .update({
          current_stage: 'resolving_repo',
          progress: appendProgress(initialProgress, 'Resolving repository...'),
        })
        .eq('run_id', runId)
    }

    // If repo has no branches (new empty repo), create initial commit so Cursor API can run
    let ghToken: string | undefined
    try {
      const session = await getSession(req, res)
      ghToken = session.github?.accessToken
    } catch (sessionErr) {
      // AUTH_SESSION_SECRET may be missing in deployment; proceed without GitHub token (bootstrap will be skipped)
      console.warn('[agent-runs/launch] Session unavailable (missing AUTH_SESSION_SECRET?):', sessionErr instanceof Error ? sessionErr.message : sessionErr)
    }
    if (ghToken) {
      const branchesResult = await listBranches(ghToken, parsed.repoFullName)
      if ('branches' in branchesResult && branchesResult.branches.length === 0) {
        const bootstrap = await ensureInitialCommit(ghToken, parsed.repoFullName, parsed.defaultBranch)
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
          json(res, 200, { runId, status: 'failed', error: bootstrap.error })
          return
        }
      }
    }

    // Update stage to 'launching' (0690)
    await supabase
      .from('hal_agent_runs')
      .update({
        current_stage: 'launching',
        status: 'launching',
        progress: appendProgress(initialProgress, 'Launching agent...'),
      })
      .eq('run_id', runId)

    // Launch Cursor agent
    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')
    const repoUrl = `https://github.com/${parsed.repoFullName}`
    const branchName =
      parsed.agentType === 'implementation'
        ? `ticket/${String(parsed.ticketNumber).padStart(4, '0')}-implementation`
        : parsed.defaultBranch
    // If a PR is already linked for this ticket, do not ask Cursor to create a new one.
    let existingPrUrl: string | null = null
    if (parsed.agentType === 'implementation' && ticketPk) {
      const { data: linked } = await supabase
        .from('hal_agent_runs')
        .select('pr_url, created_at')
        .eq('ticket_pk', ticketPk)
        .not('pr_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
      const prUrl = Array.isArray(linked) && linked.length ? (linked[0] as any)?.pr_url : null
      if (typeof prUrl === 'string' && prUrl.trim()) existingPrUrl = prUrl.trim()
    }
    const target =
      parsed.agentType === 'implementation'
        ? existingPrUrl
          ? { branchName }
          : { autoCreatePr: true, branchName }
        : { branchName: parsed.defaultBranch }
    const promptTextForLaunch =
      parsed.agentType === 'implementation' && existingPrUrl
        ? `${promptText}\n\n## Existing PR linked\n\nA PR is already linked to this ticket:\n\n- ${existingPrUrl}\n\nDo NOT create a new PR. Push changes to the branch above so the existing PR updates.`
        : promptText

    const launchRes = await fetch('https://api.cursor.com/v0/agents', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: promptTextForLaunch },
        source: { repository: repoUrl, ref: parsed.defaultBranch },
        target,
        ...(parsed.model ? { model: parsed.model } : {}),
      }),
    })

    const launchText = await launchRes.text()
    if (!launchRes.ok) {
      const branchNotFound =
        launchRes.status === 400 &&
        (/branch\s+.*\s+does not exist/i.test(launchText) || /does not exist.*branch/i.test(launchText))
      const msg = branchNotFound
        ? `The repository has no "${parsed.defaultBranch}" branch yet. If the repo is new and empty, create an initial commit and push (e.g. add a README) so the default branch exists, then try again.`
        : humanReadableCursorError(launchRes.status, launchText)
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, `Launch failed: ${msg}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
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
          current_stage: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
    }

    const cursorAgentId = launchData.id
    const cursorStatus = launchData.status ?? 'CREATING'
    if (!cursorAgentId) {
      const msg = 'Cursor API did not return an agent ID.'
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
    }

    const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${cursorStatus}).`)
    // Update stage to 'polling' (or 'running' for implementation, 'reviewing' for QA) (0690)
    const nextStage = parsed.agentType === 'implementation' ? 'running' : 'reviewing'
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'polling',
        current_stage: nextStage,
        cursor_agent_id: cursorAgentId,
        cursor_status: cursorStatus,
        progress: progressAfterLaunch,
      })
      .eq('run_id', runId)

    // Create/update worklog artifact so it exists from the start (implementation runs only)
    if (parsed.agentType === 'implementation' && ticketPk && parsed.repoFullName) {
      try {
        const worklogTitle = `Worklog for ticket ${displayId}`
        const worklogLines = [
          `# Worklog: ${displayId}`,
          '',
          '## Progress',
          ...(Array.isArray(progressAfterLaunch) ? progressAfterLaunch : []).map(
            (p: { at: string; message: string }) => `- **${p.at}** — ${p.message}`
          ),
          '',
          `**Current status:** ${cursorStatus}`,
        ]
        const res = await upsertArtifact(supabase, ticketPk, parsed.repoFullName, 'implementation', worklogTitle, worklogLines.join('\n'))
        if (!res.ok) console.warn('[agent-runs] launch worklog upsert failed:', (res as { ok: false; error: string }).error)
      } catch (e) {
        console.warn('[agent-runs] launch worklog upsert error:', e instanceof Error ? e.message : e)
      }
    }

    json(res, 200, { runId, status: 'polling', cursorAgentId })
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


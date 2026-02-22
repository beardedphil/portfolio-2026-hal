import type { IncomingMessage, ServerResponse } from 'http'
import { getOrigin } from '../_lib/github/config.js'
import {
  getServerSupabase,
  appendProgress,
  upsertArtifact,
  readJsonBody,
  json,
  validateMethod,
} from './_shared.js'
import type { AgentType, RequestBody, TicketData } from './launch/types.js'
import { determineAgentType, parseTicketContent, moveQATicketToDoing, findExistingPrUrl } from './launch/shared.js'
import { buildImplementationPrompt, buildQAPrompt } from './launch/prompts.js'
import { handleProjectManagerLaunch } from './launch/project-manager.js'
import { handleProcessReviewLaunch } from './launch/process-review.js'
import { bootstrapEmptyRepo, updateRunStages, launchCursorAgent } from './launch/cursor-agents.js'

/** Validate request body and return error response if invalid. */
function validateRequest(
  res: ServerResponse,
  repoFullName: string,
  agentType: AgentType,
  ticketNumber: number | null,
  message: string
): boolean {
  if (!repoFullName) {
    json(res, 400, { error: 'repoFullName is required.' })
    return false
  }

  const needsTicket = agentType === 'implementation' || agentType === 'qa' || agentType === 'process-review'
  if (needsTicket && (!ticketNumber || !Number.isFinite(ticketNumber))) {
    json(res, 400, { error: 'ticketNumber is required.' })
    return false
  }
  if (agentType === 'project-manager' && !message) {
    json(res, 400, { error: 'message is required for project-manager runs.' })
    return false
  }
  return true
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!validateMethod(req, res, 'POST')) {
    return
  }

  try {
    const body = (await readJsonBody(req)) as RequestBody

    const agentType = determineAgentType(body)
    const model = (typeof body.model === 'string' ? body.model.trim() : '') || ''
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const ticketNumber = typeof body.ticketNumber === 'number' ? body.ticketNumber : null
    const defaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const images = Array.isArray(body.images) ? body.images : undefined

    if (!validateRequest(res, repoFullName, agentType, ticketNumber, message)) {
      return
    }

    const supabase = getServerSupabase()

    // Project Manager (OpenAI) is async/streamed via agent-runs/work + agent-runs/stream.
    if (agentType === 'project-manager') {
      const handled = await handleProjectManagerLaunch(
        supabase,
        res,
        repoFullName,
        message,
        conversationId,
        projectId,
        defaultBranch,
        images
      )
      if (!handled) return
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

    const ticketContent = parseTicketContent(ticketData.bodyMd)

    // Process Review (OpenAI) launch: just create run row; /work will generate streamed output.
    if (agentType === 'process-review') {
      const handled = await handleProcessReviewLaunch(supabase, res, repoFullName, ticketNumber!, ticketData)
      if (!handled) return
      return
    }

    const promptText =
      agentType === 'implementation'
        ? buildImplementationPrompt(
            repoFullName,
            ticketNumber!,
            ticketData.displayId,
            ticketData.currentColumnId,
            defaultBranch,
            halApiBaseUrl,
            ticketContent
          )
        : buildQAPrompt(
            repoFullName,
            ticketNumber!,
            ticketData.displayId,
            ticketData.currentColumnId,
            defaultBranch,
            halApiBaseUrl,
            ticketContent
          )

    // Create run row - start with 'preparing' stage (0690)
    const initialProgress = appendProgress([], `Launching ${agentType} run for ${ticketData.displayId}`)
    const { data: runRow, error: runInsErr } = await supabase
      .from('hal_agent_runs')
      .insert({
        agent_type: agentType,
        repo_full_name: repoFullName,
        ticket_pk: ticketData.pk,
        ticket_number: ticketNumber,
        display_id: ticketData.displayId,
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

    // Update run stages based on agent type (0690)
    await updateRunStages(supabase, runId, agentType, initialProgress, ticketData.bodyMd)

    // Bootstrap empty repository if needed
    const bootstrapSuccess = await bootstrapEmptyRepo(
      supabase,
      runId,
      initialProgress,
      req,
      res,
      repoFullName,
      defaultBranch
    )
    if (!bootstrapSuccess) return

    // Update stage to 'launching' (0690)
    await supabase
      .from('hal_agent_runs')
      .update({
        current_stage: 'launching',
        status: 'launching',
        progress: appendProgress(initialProgress, 'Launching agent...'),
      })
      .eq('run_id', runId)

    // Find existing PR and launch Cursor agent
    const existingPrUrl = await findExistingPrUrl(supabase, agentType, ticketData.pk)
    const launchResult = await launchCursorAgent(
      supabase,
      runId,
      initialProgress,
      res,
      promptText,
      repoFullName,
      defaultBranch,
      agentType,
      ticketNumber!,
      existingPrUrl,
      model
    )
    if (!launchResult.success) return

    const { cursorAgentId, cursorStatus } = launchResult

    const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${cursorStatus}).`)
    // Update stage to 'polling' (or 'running' for implementation, 'reviewing' for QA) (0690)
    const nextStage = agentType === 'implementation' ? 'running' : 'reviewing'
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
          `**Current status:** ${cursorStatus}`,
        ]
        const artifactRes = await upsertArtifact(supabase, ticketData.pk, repoFullName, 'implementation', worklogTitle, worklogLines.join('\n'))
        if (!artifactRes.ok) console.warn('[agent-runs] launch worklog upsert failed:', (artifactRes as { ok: false; error: string }).error)
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

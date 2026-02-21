/**
 * Main status handler - orchestrates status polling and updates
 */

import type { IncomingMessage, ServerResponse } from 'http'
import {
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  getQueryParam,
  json,
  validateMethod,
  type ProgressEntry,
} from './_shared.js'
import { capText, isPlaceholderSummary, MAX_RUN_SUMMARY_CHARS, type AgentType } from './status-helpers.js'
import { fetchConversationText, needsConversationFetch, getLastAssistantMessage } from './status-conversation.js'
import { handleProcessReviewSuggestions } from './status-process-review.js'
import { updateWorklogArtifact, handleCompletedStatus } from './status-artifacts.js'
import { processStatusUpdate, determineNextStage } from './status-core.js'

async function fetchRunFromDatabase(supabase: any, runId: string): Promise<{ run: any; error: string | null }> {
  const { data: run, error: runErr } = await supabase
    .from('hal_agent_runs')
    .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress')
    .eq('run_id', runId)
    .maybeSingle()

  if (runErr) {
    return { run: null, error: `Supabase fetch failed: ${runErr.message}` }
  }
  if (!run) {
    return { run: null, error: 'Unknown runId' }
  }
  return { run, error: null }
}

function shouldReturnEarly(status: string, cursorAgentId: string | null, summary: string | null): boolean {
  const shouldEnrichTerminalSummary =
    (status === 'finished' || status === 'completed') &&
    !!cursorAgentId &&
    isPlaceholderSummary(summary)

  if ((status === 'finished' || status === 'completed' || status === 'failed') && !shouldEnrichTerminalSummary) {
    return true
  }
  if (!cursorAgentId) {
    return true
  }
  return false
}

async function fetchCursorAgentStatus(cursorAgentId: string, auth: string): Promise<{ statusData: any; error: string | null }> {
  const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })
  const statusText = await statusRes.text()

  if (!statusRes.ok) {
    return { statusData: null, error: humanReadableCursorError(statusRes.status, statusText) }
  }

  try {
    const statusData = JSON.parse(statusText) as { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }
    return { statusData, error: null }
  } catch {
    return { statusData: null, error: 'Invalid response when polling agent status.' }
  }
}

async function handleCursorApiError(
  supabase: any,
  runId: string,
  run: any,
  error: string,
  res: ServerResponse
): Promise<void> {
  const nextProgress = appendProgress((run as any).progress, `Poll failed: ${error}`)
  await supabase
    .from('hal_agent_runs')
    .update({ status: 'failed', current_stage: 'failed', error, progress: nextProgress, finished_at: new Date().toISOString() })
    .eq('run_id', runId)
  json(res, 200, { ...(run as any), status: 'failed', error, progress: nextProgress })
}

async function enrichSummaryFromConversation(
  summary: string | null,
  agentType: AgentType,
  cursorAgentId: string,
  auth: string
): Promise<string | null> {
  if (!needsConversationFetch(agentType, summary)) {
    return summary
  }

  const conversationText = await fetchConversationText(cursorAgentId, auth)
  if (isPlaceholderSummary(summary) && conversationText) {
    const lastAssistant = getLastAssistantMessage(conversationText)
    if (lastAssistant) return lastAssistant
  }
  if (isPlaceholderSummary(summary)) return 'Completed.'
  return summary
}

async function updateRunInDatabase(
  supabase: any,
  runId: string,
  cursorStatus: string,
  nextStatus: string,
  nextStage: string | null,
  summary: string | null,
  prUrl: string | null,
  errMsg: string | null,
  progress: ProgressEntry[],
  finishedAt: string | null
): Promise<{ updated: any; error: string | null }> {
  const { data: updated, error: updErr } = await supabase
    .from('hal_agent_runs')
    .update({
      cursor_status: cursorStatus,
      status: nextStatus,
      ...(nextStage != null ? { current_stage: nextStage } : {}),
      ...(summary != null ? { summary } : {}),
      ...(prUrl != null ? { pr_url: prUrl } : {}),
      ...(errMsg != null ? { error: errMsg } : {}),
      progress,
      ...(finishedAt ? { finished_at: finishedAt } : {}),
    })
    .eq('run_id', runId)
    .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, created_at, updated_at, finished_at')
    .maybeSingle()

  if (updErr) {
    return { updated: null, error: `Supabase update failed: ${updErr.message}` }
  }
  return { updated, error: null }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!validateMethod(req, res, 'GET')) {
    return
  }

  try {
    const runId = (getQueryParam(req, 'runId') ?? '').trim()
    if (!runId) {
      json(res, 400, { error: 'runId is required' })
      return
    }

    const supabase = getServerSupabase()
    const { run, error: runError } = await fetchRunFromDatabase(supabase, runId)
    if (runError) {
      json(res, run ? 500 : 404, { error: runError })
      return
    }

    const status = (run as any).status as string
    const cursorAgentId = (run as any).cursor_agent_id as string | null
    const agentType = (run as any).agent_type as AgentType
    const summary = (run as any).summary as string | null

    if (shouldReturnEarly(status, cursorAgentId, summary)) {
      json(res, 200, run)
      return
    }

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')

    const { statusData, error: cursorError } = await fetchCursorAgentStatus(cursorAgentId!, auth)
    if (cursorError) {
      await handleCursorApiError(supabase, runId, run, cursorError, res)
      return
    }

    const cursorStatus = statusData.status ?? (run as any).cursor_status ?? 'RUNNING'
    const repoFullName = (run as any).repo_full_name as string
    const ticketPk = (run as any).ticket_pk as string | null
    const displayId = ((run as any).display_id as string) ?? ''
    const currentStage = (run as any).current_stage as string | null
    const existingPrUrl = (run as any).pr_url ?? null

    const statusUpdate = processStatusUpdate(
      cursorStatus,
      statusData,
      agentType,
      currentStage,
      repoFullName,
      existingPrUrl
    )

    let finalSummary = statusUpdate.summary
    let finalPrUrl = statusUpdate.prUrl
    if (cursorStatus === 'FINISHED') {
      finalSummary = await enrichSummaryFromConversation(finalSummary, agentType, cursorAgentId!, auth)
      finalSummary = capText(finalSummary, MAX_RUN_SUMMARY_CHARS)

      const conversationText = needsConversationFetch(agentType, finalSummary)
        ? await fetchConversationText(cursorAgentId!, auth)
        : null

      const processReviewSuggestions = await handleProcessReviewSuggestions(
        supabase,
        agentType,
        ticketPk,
        finalSummary,
        conversationText,
        repoFullName
      )

      const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`) as ProgressEntry[]

      await updateWorklogArtifact(
        supabase,
        agentType,
        repoFullName,
        ticketPk,
        displayId,
        progress,
        cursorStatus,
        finalSummary,
        statusUpdate.errMsg,
        finalPrUrl
      )

      if (statusUpdate.nextStatus === 'completed') {
        await handleCompletedStatus(supabase, req, res, repoFullName, ticketPk, displayId, finalSummary, finalPrUrl)
      }

      const { updated, error: updateError } = await updateRunInDatabase(
        supabase,
        runId,
        cursorStatus,
        statusUpdate.nextStatus,
        statusUpdate.nextStage,
        finalSummary,
        finalPrUrl,
        statusUpdate.errMsg,
        progress,
        statusUpdate.finishedAt
      )

      if (updateError) {
        json(res, 500, { error: updateError })
        return
      }

      const payload = updated ?? run
      if (processReviewSuggestions != null) {
        json(res, 200, { ...(payload as object), suggestions: processReviewSuggestions })
        return
      }
      json(res, 200, payload)
      return
    }

    const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`) as ProgressEntry[]

    await updateWorklogArtifact(
      supabase,
      agentType,
      repoFullName,
      ticketPk,
      displayId,
      progress,
      cursorStatus,
      statusUpdate.summary,
      statusUpdate.errMsg,
      finalPrUrl
    )

    const { updated, error: updateError } = await updateRunInDatabase(
      supabase,
      runId,
      cursorStatus,
      statusUpdate.nextStatus,
      statusUpdate.nextStage,
      statusUpdate.summary,
      finalPrUrl,
      statusUpdate.errMsg,
      progress,
      statusUpdate.finishedAt
    )

    if (updateError) {
      json(res, 500, { error: updateError })
      return
    }

    json(res, 200, updated ?? run)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

// Re-export for tests
export { capText, isPlaceholderSummary, getLastAssistantMessage, parseProcessReviewSuggestionsFromText } from './status-helpers.js'
export { getLastAssistantMessage as getLastAssistantMessageFromConversation } from './status-conversation.js'
export { parseProcessReviewSuggestionsFromText as parseProcessReviewSuggestions } from './status-process-review.js'

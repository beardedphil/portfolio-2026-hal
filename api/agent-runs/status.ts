import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import {
  fetchPullRequestFiles,
  generateImplementationArtifacts,
} from '../_lib/github/githubApi.js'
import {
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  upsertArtifact,
  buildWorklogBodyFromProgress,
  getQueryParam,
  json,
  validateMethod,
  type ProgressEntry,
} from './_shared.js'

type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

const MAX_RUN_SUMMARY_CHARS = 20_000
export function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

export function isPlaceholderSummary(summary: string | null | undefined): boolean {
  const s = String(summary ?? '').trim()
  if (!s) return true
  return s === 'Completed.' || s === 'Done.' || s === 'Complete.' || s === 'Finished.'
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p
        if (p && typeof p === 'object') {
          const anyP = p as any
          return (
            (typeof anyP.text === 'string' ? anyP.text : '') ||
            (typeof anyP.content === 'string' ? anyP.content : '') ||
            (typeof anyP.value === 'string' ? anyP.value : '')
          )
        }
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  if (content && typeof content === 'object') {
    const anyC = content as any
    if (typeof anyC.text === 'string') return anyC.text
    if (typeof anyC.content === 'string') return anyC.content
    if (typeof anyC.value === 'string') return anyC.value
  }
  return ''
}

function getMessagesFromConversation(conv: any): any[] {
  if (Array.isArray(conv?.messages)) return conv.messages
  if (Array.isArray(conv?.conversation?.messages)) return conv.conversation.messages
  return []
}

export function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as any
    const messages = getMessagesFromConversation(conv)

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(extractTextFromContent(m?.content ?? '')).trim())
    const content = extractTextFromContent(lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

function parseSuggestionsArray(candidate: string): Array<{ text: string; justification: string }> | null {
  const s = candidate.trim()
  if (!s) return null
  try {
    const parsed = JSON.parse(s) as unknown
    if (!Array.isArray(parsed)) return null
    const suggestions = (parsed as any[])
      .filter((item) => item && typeof item === 'object')
      .filter((item) => typeof (item as any).text === 'string' && typeof (item as any).justification === 'string')
      .map((item) => ({
        text: String((item as any).text).trim(),
        justification: String((item as any).justification).trim(),
      }))
      .filter((s) => s.text.length > 0 && s.justification.length > 0)
    return suggestions.length > 0 ? suggestions : null
  } catch {
    return null
  }
}

function extractJsonArrayFromText(text: string): string | null {
  const start = text.indexOf('[')
  if (start === -1) return null
  
  let depth = 0
  let inString = false
  let escape = false
  
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

export function parseProcessReviewSuggestionsFromText(
  input: string
): Array<{ text: string; justification: string }> | null {
  const text = String(input ?? '').trim()
  if (!text) return null

  // 1) If the whole message is already a JSON array, parse directly.
  const direct = parseSuggestionsArray(text)
  if (direct) return direct

  // 2) If wrapped in markdown code blocks, prefer the first fenced block body.
  // Supports ```json ... ``` and ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = parseSuggestionsArray(fenced[1])
    if (fromFence) return fromFence
  }

  // 3) Fallback: extract the first JSON-ish array substring via a simple bracket match.
  const extracted = extractJsonArrayFromText(text)
  if (extracted) {
    return parseSuggestionsArray(extracted)
  }
  return null
}

async function fetchConversationText(cursorAgentId: string, auth: string): Promise<string | null> {
  try {
    const convRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}/conversation`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const text = await convRes.text()
    return convRes.ok && text ? text : null
  } catch (e) {
    console.warn('[agent-runs] conversation fetch failed:', e instanceof Error ? e.message : e)
    return null
  }
}

function needsConversationFetch(agentType: AgentType, summary: string | null): boolean {
  return (
    agentType === 'process-review' ||
    agentType === 'project-manager' ||
    agentType === 'qa' ||
    agentType === 'implementation' ||
    isPlaceholderSummary(summary)
  )
}

function buildPrUrl(
  statusData: { target?: { prUrl?: string; pr_url?: string; branchName?: string } },
  existingPrUrl: string | null,
  repoFullName: string
): string | null {
  let prUrl = statusData.target?.prUrl ?? statusData.target?.pr_url ?? existingPrUrl
  const branchName = statusData.target?.branchName
  if (!prUrl && repoFullName && branchName) {
    prUrl = `https://github.com/${repoFullName}/tree/${encodeURIComponent(branchName)}`
  }
  return prUrl
}

async function handleProcessReviewSuggestions(
  supabase: any,
  agentType: AgentType,
  ticketPk: string | null,
  summary: string | null,
  conversationText: string | null,
  repoFullName: string
): Promise<Array<{ text: string; justification: string }> | null> {
  if (agentType !== 'process-review' || !ticketPk) return null

  const fromSummary = parseProcessReviewSuggestionsFromText(summary ?? '')
  const fromConversation = conversationText
    ? parseProcessReviewSuggestionsFromText(getLastAssistantMessage(conversationText) ?? '')
    : null
  const suggestions = fromSummary ?? fromConversation ?? []

  if (suggestions.length > 0 || fromSummary != null || fromConversation != null) {
    try {
      await supabase.from('process_reviews').insert({
        ticket_pk: ticketPk,
        repo_full_name: repoFullName,
        suggestions: suggestions,
        status: 'success',
        error_message: null,
      })
      return suggestions
    } catch (e) {
      console.warn('[agent-runs] process-review conversation fetch/parse failed:', e instanceof Error ? e.message : e)
    }
  } else {
    try {
      const { data: existingReview } = await supabase
        .from('process_reviews')
        .select('suggestions, status')
        .eq('ticket_pk', ticketPk)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingReview && existingReview.status === 'success' && existingReview.suggestions && Array.isArray(existingReview.suggestions) && existingReview.suggestions.length > 0) {
        const dbSuggestions = existingReview.suggestions
          .map((s: string | { text: string; justification?: string }) => {
            if (typeof s === 'string') {
              return { text: s, justification: 'No justification provided.' }
            } else if (s && typeof s === 'object' && typeof s.text === 'string') {
              return {
                text: s.text,
                justification: s.justification || 'No justification provided.',
              }
            }
            return null
          })
          .filter((s): s is { text: string; justification: string } => s !== null)

        if (dbSuggestions.length > 0) {
          return dbSuggestions
        }
      }
    } catch (e) {
      console.warn('[agent-runs] process-review database fallback failed:', e instanceof Error ? e.message : e)
    }
  }
  return null
}

function determineNextStage(
  cursorStatus: string,
  agentType: AgentType,
  currentStage: string | null
): string | null {
  if (cursorStatus === 'FINISHED') return 'completed'
  if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') return 'failed'

  const validIntermediateStages = [
    'preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch',
    'launching', 'running', 'reviewing'
  ]
  if (!currentStage || !validIntermediateStages.includes(currentStage)) {
    return agentType === 'implementation' ? 'running' : 'reviewing'
  }
  return null
}

async function updateWorklogArtifact(
  supabase: any,
  agentType: AgentType,
  repoFullName: string,
  ticketPk: string | null,
  displayId: string,
  progress: ProgressEntry[],
  cursorStatus: string,
  summary: string | null,
  errMsg: string | null,
  prUrl: string | null
): Promise<void> {
  if (agentType !== 'implementation' || !repoFullName || !ticketPk) return

  try {
    const worklogTitle = `Worklog for ticket ${displayId}`
    if (cursorStatus === 'FINISHED' || progress.length <= 2) {
      console.warn('[agent-runs] upserting worklog', { displayId, ticketPk, repoFullName })
    }
    const worklogBody = buildWorklogBodyFromProgress(
      displayId,
      progress,
      cursorStatus,
      summary,
      errMsg,
      prUrl
    )
    const result = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', worklogTitle, worklogBody)
    if (!result.ok) console.warn('[agent-runs] worklog upsert failed:', (result as { ok: false; error: string }).error)
  } catch (e) {
    console.warn('[agent-runs] worklog upsert error:', e instanceof Error ? e.message : e)
  }
}

async function moveTicketToQa(supabase: any, repoFullName: string, ticketPk: string | null): Promise<void> {
  try {
    const { data: inColumn } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('repo_full_name', repoFullName)
      .eq('kanban_column_id', 'col-qa')
      .order('kanban_position', { ascending: false })
      .limit(1)
    const nextPosition = inColumn?.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
    const movedAt = new Date().toISOString()
    await supabase
      .from('tickets')
      .update({ kanban_column_id: 'col-qa', kanban_position: nextPosition, kanban_moved_at: movedAt })
      .eq('pk', ticketPk)
  } catch {
    // ignore
  }
}

async function fetchPrFiles(
  req: IncomingMessage,
  res: ServerResponse,
  prUrl: string | null
): Promise<{ files: Array<{ filename: string; status: string; additions: number; deletions: number }> | null; error: string | null }> {
  try {
    const ghToken =
      process.env.GITHUB_TOKEN?.trim() ||
      (await getSession(req, res).catch(() => null))?.github?.accessToken
    if (!ghToken || !prUrl || !/\/pull\/\d+/i.test(prUrl)) {
      return { files: null, error: null }
    }
    const filesResult = await fetchPullRequestFiles(ghToken, prUrl)
    if ('files' in filesResult) {
      return { files: filesResult.files, error: null }
    } else if ('error' in filesResult) {
      console.warn('[agent-runs] fetch PR files failed:', filesResult.error)
      return { files: null, error: filesResult.error }
    }
    return { files: null, error: null }
  } catch (e) {
    console.warn('[agent-runs] fetch PR files error:', e instanceof Error ? e.message : e)
    return { files: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

async function upsertImplementationArtifacts(
  supabase: any,
  displayId: string,
  summary: string | null,
  prUrl: string | null,
  prFiles: Array<{ filename: string; status: string; additions: number; deletions: number }> | null,
  prFilesError: string | null,
  ticketPk: string | null,
  repoFullName: string
): Promise<void> {
  try {
    const { artifacts, errors } = generateImplementationArtifacts(
      displayId,
      summary ?? '',
      prUrl ?? null,
      prFiles,
      prFilesError
    )
    for (const a of artifacts) {
      if (a.body_md === null) {
        console.warn(`[agent-runs] Skipping artifact "${a.title}" - ${a.error || 'data unavailable'}`)
        continue
      }
      const res = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', a.title, a.body_md)
      if (!res.ok) console.warn('[agent-runs] artifact upsert failed:', a.title, (res as { ok: false; error: string }).error)
    }
    if (errors.length > 0) {
      console.warn('[agent-runs] Some artifacts could not be generated:', errors.map((e) => `${e.artifactType}: ${e.reason}`).join('; '))
    }
  } catch (e) {
    console.warn('[agent-runs] finished artifact upsert error:', e instanceof Error ? e.message : e)
  }
}

async function handleCompletedStatus(
  supabase: any,
  req: IncomingMessage,
  res: ServerResponse,
  repoFullName: string,
  ticketPk: string | null,
  displayId: string,
  summary: string | null,
  prUrl: string | null
): Promise<void> {
  await moveTicketToQa(supabase, repoFullName, ticketPk)
  const { files: prFiles, error: prFilesError } = await fetchPrFiles(req, res, prUrl)
  await upsertImplementationArtifacts(supabase, displayId, summary, prUrl, prFiles, prFilesError, ticketPk, repoFullName)
}

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

function processFinishedStatus(
  statusData: any,
  existingPrUrl: string | null,
  repoFullName: string,
  agentType: AgentType
): { summary: string | null; prUrl: string | null } {
  const summary = statusData.summary ?? null
  const prUrl = buildPrUrl(statusData, existingPrUrl, repoFullName)
  if (!prUrl && agentType === 'implementation') {
    console.warn('[agent-runs] FINISHED but no prUrl in Cursor response. target=', JSON.stringify(statusData.target))
  }
  return { summary, prUrl }
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

function processStatusUpdate(
  cursorStatus: string,
  statusData: any,
  agentType: AgentType,
  currentStage: string | null,
  repoFullName: string,
  existingPrUrl: string | null
): {
  nextStatus: string
  nextStage: string | null
  summary: string | null
  prUrl: string | null
  errMsg: string | null
  finishedAt: string | null
} {
  if (cursorStatus === 'FINISHED') {
    const { summary, prUrl } = processFinishedStatus(statusData, existingPrUrl, repoFullName, agentType)
    return {
      nextStatus: 'finished',
      nextStage: 'completed',
      summary,
      prUrl,
      errMsg: null,
      finishedAt: new Date().toISOString(),
    }
  } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
    return {
      nextStatus: 'failed',
      nextStage: 'failed',
      summary: null,
      prUrl: existingPrUrl,
      errMsg: statusData.summary ?? `Agent ended with status ${cursorStatus}.`,
      finishedAt: new Date().toISOString(),
    }
  } else {
    const nextStage = determineNextStage(cursorStatus, agentType, currentStage)
    return {
      nextStatus: 'polling',
      nextStage,
      summary: null,
      prUrl: existingPrUrl,
      errMsg: null,
      finishedAt: null,
    }
  }
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

      const conversationText = needsConversationFetch(agentType, summary)
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
      prUrl
    )

    const { updated, error: updateError } = await updateRunInDatabase(
      supabase,
      runId,
      cursorStatus,
      statusUpdate.nextStatus,
      statusUpdate.nextStage,
      statusUpdate.summary,
      prUrl,
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


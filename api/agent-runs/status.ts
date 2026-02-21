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

export function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as any
    const messages: any[] =
      (Array.isArray(conv?.messages) && conv.messages) ||
      (Array.isArray(conv?.conversation?.messages) && conv.conversation.messages) ||
      []

    const toText = (content: unknown): string => {
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

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(toText(m?.content ?? '')).trim())
    const content = toText(lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

export function parseProcessReviewSuggestionsFromText(
  input: string
): Array<{ text: string; justification: string }> | null {
  const text = String(input ?? '').trim()
  if (!text) return null

  const tryParse = (candidate: string): Array<{ text: string; justification: string }> | null => {
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
      return suggestions
    } catch {
      return null
    }
  }

  // 1) If the whole message is already a JSON array, parse directly.
  const direct = tryParse(text)
  if (direct) return direct

  // 2) If wrapped in markdown code blocks, prefer the first fenced block body.
  // Supports ```json ... ``` and ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = tryParse(fenced[1])
    if (fromFence) return fromFence
  }

  // 3) Fallback: extract the first JSON-ish array substring via a simple bracket match.
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
    if (ch === ']') depth--
    if (depth === 0) {
      const slice = text.slice(start, i + 1)
      const fromSlice = tryParse(slice)
      if (fromSlice) return fromSlice
      break
    }
  }
  return null
}

type RunData = {
  run_id: string
  agent_type: AgentType
  repo_full_name: string
  ticket_pk: string | null
  display_id: string
  cursor_agent_id: string | null
  cursor_status: string | null
  pr_url: string | null
  summary: string | null
  error: string | null
  status: string
  current_stage: string | null
  progress: any[] | null
}

type StatusUpdate = {
  nextStatus: string
  nextStage: string | null
  summary: string | null
  prUrl: string | null
  errMsg: string | null
  finishedAt: string | null
  processReviewSuggestions: Array<{ text: string; justification: string }> | null
}

async function fetchCursorStatus(cursorAgentId: string, auth: string): Promise<{
  success: boolean
  statusData?: { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }
  error?: string
  statusText?: string
}> {
  const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })
  const statusText = await statusRes.text()
  
  if (!statusRes.ok) {
    return {
      success: false,
      error: humanReadableCursorError(statusRes.status, statusText),
    }
  }

  try {
    const statusData = JSON.parse(statusText) as { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }
    return { success: true, statusData, statusText }
  } catch {
    return {
      success: false,
      error: 'Invalid response when polling agent status.',
    }
  }
}

async function fetchConversation(cursorAgentId: string, auth: string): Promise<string | null> {
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

function shouldFetchConversation(agentType: AgentType, summary: string | null): boolean {
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
  const prUrl = statusData.target?.prUrl ?? statusData.target?.pr_url ?? existingPrUrl
  if (prUrl) return prUrl
  
  const branchName = statusData.target?.branchName
  if (branchName && repoFullName) {
    return `https://github.com/${repoFullName}/tree/${encodeURIComponent(branchName)}`
  }
  
  return null
}

async function processFinishedStatus(
  statusData: { summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } },
  run: RunData,
  cursorAgentId: string,
  auth: string,
  supabase: ReturnType<typeof getServerSupabase>
): Promise<StatusUpdate> {
  const agentType = run.agent_type
  const ticketPk = run.ticket_pk
  const repoFullName = run.repo_full_name
  
  let summary = statusData.summary ?? null
  const prUrl = buildPrUrl(statusData, run.pr_url, repoFullName)
  
  if (!prUrl && agentType === 'implementation') {
    console.warn('[agent-runs] FINISHED but no prUrl in Cursor response. target=', JSON.stringify(statusData.target))
  }

  // Fetch conversation if needed
  let conversationText: string | null = null
  if (shouldFetchConversation(agentType, summary)) {
    conversationText = await fetchConversation(cursorAgentId, auth)
  }

  // Enrich summary from conversation if placeholder
  if (isPlaceholderSummary(summary) && conversationText) {
    const lastAssistant = getLastAssistantMessage(conversationText)
    if (lastAssistant) summary = lastAssistant
  }
  if (isPlaceholderSummary(summary)) summary = 'Completed.'
  summary = capText(summary ?? '', MAX_RUN_SUMMARY_CHARS)

  // Process review suggestions
  let processReviewSuggestions: Array<{ text: string; justification: string }> | null = null
  if (agentType === 'process-review' && ticketPk) {
    processReviewSuggestions = await handleProcessReviewSuggestions(
      summary,
      conversationText,
      ticketPk,
      repoFullName,
      supabase
    )
  }

  return {
    nextStatus: 'finished',
    nextStage: 'completed',
    summary,
    prUrl,
    errMsg: null,
    finishedAt: new Date().toISOString(),
    processReviewSuggestions,
  }
}

async function handleProcessReviewSuggestions(
  summary: string | null,
  conversationText: string | null,
  ticketPk: string,
  repoFullName: string,
  supabase: ReturnType<typeof getServerSupabase>
): Promise<Array<{ text: string; justification: string }> | null> {
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
  }

  // Fallback: try loading from existing process_reviews record
  try {
    const { data: existingReview } = await supabase
      .from('process_reviews')
      .select('suggestions, status')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (
      existingReview &&
      existingReview.status === 'success' &&
      existingReview.suggestions &&
      Array.isArray(existingReview.suggestions) &&
      existingReview.suggestions.length > 0
    ) {
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

  return null
}

function processFailedStatus(
  cursorStatus: string,
  statusData: { summary?: string }
): StatusUpdate {
  return {
    nextStatus: 'failed',
    nextStage: 'failed',
    summary: null,
    prUrl: null,
    errMsg: statusData.summary ?? `Agent ended with status ${cursorStatus}.`,
    finishedAt: new Date().toISOString(),
    processReviewSuggestions: null,
  }
}

function processPollingStatus(
  cursorStatus: string,
  run: RunData,
  agentType: AgentType
): StatusUpdate {
  const validIntermediateStages = [
    'preparing',
    'fetching_ticket',
    'resolving_repo',
    'fetching_branch',
    'launching',
    'running',
    'reviewing',
  ]
  
  const currentStage = run.current_stage
  const nextStage =
    !currentStage || !validIntermediateStages.includes(currentStage)
      ? agentType === 'implementation'
        ? 'running'
        : 'reviewing'
      : null

  return {
    nextStatus: 'polling',
    nextStage,
    summary: null,
    prUrl: null,
    errMsg: null,
    finishedAt: null,
    processReviewSuggestions: null,
  }
}

async function updateWorklog(
  run: RunData,
  cursorStatus: string,
  summary: string | null,
  errMsg: string | null,
  prUrl: string | null,
  progress: ProgressEntry[],
  supabase: ReturnType<typeof getServerSupabase>
): Promise<void> {
  if (run.agent_type !== 'implementation' || !run.repo_full_name || !run.ticket_pk) {
    return
  }

  try {
    const worklogTitle = `Worklog for ticket ${run.display_id}`
    if (cursorStatus === 'FINISHED' || progress.length <= 2) {
      console.warn('[agent-runs] upserting worklog', {
        displayId: run.display_id,
        ticketPk: run.ticket_pk,
        repoFullName: run.repo_full_name,
      })
    }
    const worklogBody = buildWorklogBodyFromProgress(
      run.display_id,
      progress,
      cursorStatus,
      summary,
      errMsg,
      prUrl
    )
    const result = await upsertArtifact(
      supabase,
      run.ticket_pk,
      run.repo_full_name,
      'implementation',
      worklogTitle,
      worklogBody
    )
    if (!result.ok) {
      console.warn('[agent-runs] worklog upsert failed:', (result as { ok: false; error: string }).error)
    }
  } catch (e) {
    console.warn('[agent-runs] worklog upsert error:', e instanceof Error ? e.message : e)
  }
}

async function moveTicketToQA(
  ticketPk: string,
  repoFullName: string,
  supabase: ReturnType<typeof getServerSupabase>
): Promise<void> {
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

async function upsertImplementationArtifacts(
  displayId: string,
  summary: string | null,
  prUrl: string | null,
  ticketPk: string,
  repoFullName: string,
  req: IncomingMessage,
  res: ServerResponse,
  supabase: ReturnType<typeof getServerSupabase>
): Promise<void> {
  try {
    const ghToken =
      process.env.GITHUB_TOKEN?.trim() ||
      (await getSession(req, res).catch(() => null))?.github?.accessToken
    let prFiles: Array<{ filename: string; status: string; additions: number; deletions: number }> | null = null
    let prFilesError: string | null = null
    if (ghToken && prUrl && /\/pull\/\d+/i.test(prUrl)) {
      const filesResult = await fetchPullRequestFiles(ghToken, prUrl)
      if ('files' in filesResult) {
        prFiles = filesResult.files
      } else if ('error' in filesResult) {
        prFilesError = filesResult.error
        console.warn('[agent-runs] fetch PR files failed:', prFilesError)
      }
    }
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
      const result = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', a.title, a.body_md)
      if (!result.ok) {
        console.warn('[agent-runs] artifact upsert failed:', a.title, (result as { ok: false; error: string }).error)
      }
    }
    if (errors.length > 0) {
      console.warn(
        '[agent-runs] Some artifacts could not be generated:',
        errors.map((e) => `${e.artifactType}: ${e.reason}`).join('; ')
      )
    }
  } catch (e) {
    console.warn('[agent-runs] finished artifact upsert error:', e instanceof Error ? e.message : e)
  }
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
    const { data: run, error: runErr } = await supabase
      .from('hal_agent_runs')
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress')
      .eq('run_id', runId)
      .maybeSingle()

    if (runErr) {
      json(res, 500, { error: `Supabase fetch failed: ${runErr.message}` })
      return
    }
    if (!run) {
      json(res, 404, { error: 'Unknown runId' })
      return
    }

    const status = (run as any).status as string
    const cursorAgentId = (run as any).cursor_agent_id as string | null
    const agentType = (run as any).agent_type as AgentType

    // Terminal states: return without calling Cursor (unless we need to enrich a placeholder summary)
    // For all agent types, if summary is placeholder, fetch conversation to extract last assistant message
    // Note: 'completed' is the new terminal status (replaces 'finished') (0690)
    const shouldEnrichTerminalSummary =
      (status === 'finished' || status === 'completed') &&
      !!cursorAgentId &&
      isPlaceholderSummary((run as any).summary as string | null)

    if ((status === 'finished' || status === 'completed' || status === 'failed') && !shouldEnrichTerminalSummary) {
      json(res, 200, run)
      return
    }

    if (!cursorAgentId) {
      json(res, 200, run)
      return
    }

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')

    const cursorResult = await fetchCursorStatus(cursorAgentId, auth)
    if (!cursorResult.success) {
      const msg = cursorResult.error ?? 'Unknown error'
      const nextProgress = appendProgress((run as any).progress, `Poll failed: ${msg}`)
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: msg,
          progress: nextProgress,
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    const statusData = cursorResult.statusData!
    const cursorStatus = statusData.status ?? (run as any).cursor_status ?? 'RUNNING'
    const runData: RunData = {
      run_id: run.run_id,
      agent_type: agentType,
      repo_full_name: (run as any).repo_full_name as string,
      ticket_pk: (run as any).ticket_pk as string | null,
      display_id: ((run as any).display_id as string) ?? '',
      cursor_agent_id: cursorAgentId,
      cursor_status: cursorStatus,
      pr_url: (run as any).pr_url ?? null,
      summary: (run as any).summary ?? null,
      error: (run as any).error ?? null,
      status: (run as any).status as string,
      current_stage: (run as any).current_stage as string | null,
      progress: (run as any).progress,
    }

    let statusUpdate: StatusUpdate
    if (cursorStatus === 'FINISHED') {
      statusUpdate = await processFinishedStatus(statusData, runData, cursorAgentId, auth, supabase)
    } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
      statusUpdate = processFailedStatus(cursorStatus, statusData)
    } else {
      statusUpdate = processPollingStatus(cursorStatus, runData, agentType)
    }

    const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`) as ProgressEntry[]

    // Update worklog for implementation runs
    await updateWorklog(
      runData,
      cursorStatus,
      statusUpdate.summary,
      statusUpdate.errMsg,
      statusUpdate.prUrl,
      progress,
      supabase
    )

    // When finished: move ticket to QA and upsert full artifact set
    if (statusUpdate.nextStatus === 'finished' && runData.ticket_pk) {
      await moveTicketToQA(runData.ticket_pk, runData.repo_full_name, supabase)
      await upsertImplementationArtifacts(
        runData.display_id,
        statusUpdate.summary,
        statusUpdate.prUrl,
        runData.ticket_pk,
        runData.repo_full_name,
        req,
        res,
        supabase
      )
    }

    const { data: updated, error: updErr } = await supabase
      .from('hal_agent_runs')
      .update({
        cursor_status: cursorStatus,
        status: statusUpdate.nextStatus,
        ...(statusUpdate.nextStage != null ? { current_stage: statusUpdate.nextStage } : {}),
        ...(statusUpdate.summary != null ? { summary: statusUpdate.summary } : {}),
        ...(statusUpdate.prUrl != null ? { pr_url: statusUpdate.prUrl } : {}),
        ...(statusUpdate.errMsg != null ? { error: statusUpdate.errMsg } : {}),
        progress,
        ...(statusUpdate.finishedAt ? { finished_at: statusUpdate.finishedAt } : {}),
      })
      .eq('run_id', runId)
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, created_at, updated_at, finished_at')
      .maybeSingle()

    if (updErr) {
      json(res, 500, { error: `Supabase update failed: ${updErr.message}` })
      return
    }

    const payload = updated ?? run
    if (statusUpdate.processReviewSuggestions != null) {
      json(res, 200, { ...(payload as object), suggestions: statusUpdate.processReviewSuggestions })
      return
    }
    json(res, 200, payload)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}


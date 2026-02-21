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
  return (
    (Array.isArray(conv?.messages) && conv.messages) ||
    (Array.isArray(conv?.conversation?.messages) && conv.conversation.messages) ||
    []
  )
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

function isValidSuggestion(item: any): item is { text: string; justification: string } {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.text === 'string' &&
    typeof item.justification === 'string'
  )
}

function parseSuggestionArray(candidate: string): Array<{ text: string; justification: string }> | null {
  const s = candidate.trim()
  if (!s) return null
  try {
    const parsed = JSON.parse(s) as unknown
    if (!Array.isArray(parsed)) return null
    const suggestions = (parsed as any[])
      .filter(isValidSuggestion)
      .map((item) => ({
        text: String(item.text).trim(),
        justification: String(item.justification).trim(),
      }))
      .filter((s) => s.text.length > 0 && s.justification.length > 0)
    return suggestions
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
    if (ch === ']') depth--
    if (depth === 0) {
      return text.slice(start, i + 1)
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
  const direct = parseSuggestionArray(text)
  if (direct) return direct

  // 2) If wrapped in markdown code blocks, prefer the first fenced block body.
  // Supports ```json ... ``` and ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = parseSuggestionArray(fenced[1])
    if (fromFence) return fromFence
  }

  // 3) Fallback: extract the first JSON-ish array substring via a simple bracket match.
  const jsonArray = extractJsonArrayFromText(text)
  if (jsonArray) {
    const fromSlice = parseSuggestionArray(jsonArray)
    if (fromSlice) return fromSlice
  }
  return null
}

function shouldEnrichTerminalSummary(
  status: string,
  cursorAgentId: string | null,
  summary: string | null
): boolean {
  return (
    (status === 'finished' || status === 'completed') &&
    !!cursorAgentId &&
    isPlaceholderSummary(summary)
  )
}

async function fetchCursorStatus(
  cursorAgentId: string,
  auth: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const statusText = await statusRes.text()
    if (!statusRes.ok) {
      return { ok: false, error: humanReadableCursorError(statusRes.status, statusText) }
    }
    try {
      const statusData = JSON.parse(statusText)
      return { ok: true, data: statusData }
    } catch {
      return { ok: false, error: 'Invalid response when polling agent status.' }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function fetchConversation(
  cursorAgentId: string,
  auth: string
): Promise<string | null> {
  try {
    const convRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}/conversation`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const text = await convRes.text()
    return convRes.ok && text ? text : null
  } catch {
    return null
  }
}

function determineNextStage(
  cursorStatus: string,
  currentStage: string | null,
  agentType: AgentType
): string | null {
  if (cursorStatus === 'FINISHED') return 'completed'
  if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
    return 'failed'
  }
  // While polling, preserve intermediate stages
  const validIntermediateStages = [
    'preparing',
    'fetching_ticket',
    'resolving_repo',
    'fetching_branch',
    'launching',
    'running',
    'reviewing',
  ]
  if (!currentStage || !validIntermediateStages.includes(currentStage)) {
    return agentType === 'implementation' ? 'running' : 'reviewing'
  }
  return null // Preserve current stage
}

async function processProcessReviewSuggestions(
  supabase: any,
  agentType: AgentType,
  ticketPk: string | null,
  repoFullName: string,
  summary: string | null,
  conversationText: string | null
): Promise<Array<{ text: string; justification: string }> | null> {
  if (agentType !== 'process-review' || !ticketPk) return null

  const fromSummary = summary ? parseProcessReviewSuggestionsFromText(summary) : null
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
      console.warn('[agent-runs] process-review insert failed:', e instanceof Error ? e.message : e)
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

      if (dbSuggestions.length > 0) return dbSuggestions
    }
  } catch (e) {
    console.warn('[agent-runs] process-review database fallback failed:', e instanceof Error ? e.message : e)
  }
  return null
}

async function upsertWorklog(
  supabase: any,
  agentType: AgentType,
  displayId: string,
  repoFullName: string,
  ticketPk: string | null,
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
    if (!result.ok) {
      console.warn('[agent-runs] worklog upsert failed:', (result as { ok: false; error: string }).error)
    }
  } catch (e) {
    console.warn('[agent-runs] worklog upsert error:', e instanceof Error ? e.message : e)
  }
}

async function handleCompletedImplementation(
  supabase: any,
  req: IncomingMessage,
  res: ServerResponse,
  repoFullName: string,
  ticketPk: string,
  displayId: string,
  summary: string | null,
  prUrl: string | null
): Promise<void> {
  // Move ticket to QA
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

  // Upsert implementation artifacts
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
      console.warn('[agent-runs] Some artifacts could not be generated:', errors.map((e) => `${e.artifactType}: ${e.reason}`).join('; '))
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
    const currentSummary = (run as any).summary as string | null

    // Terminal states: return without calling Cursor (unless we need to enrich a placeholder summary)
    const needsEnrichment = shouldEnrichTerminalSummary(status, cursorAgentId, currentSummary)
    if ((status === 'finished' || status === 'completed' || status === 'failed') && !needsEnrichment) {
      json(res, 200, run)
      return
    }

    if (!cursorAgentId) {
      json(res, 200, run)
      return
    }

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')

    const statusResult = await fetchCursorStatus(cursorAgentId, auth)
    if (!statusResult.ok) {
      const msg = statusResult.error || 'Unknown error'
      const nextProgress = appendProgress((run as any).progress, `Poll failed: ${msg}`)
      await supabase
        .from('hal_agent_runs')
        .update({ status: 'failed', current_stage: 'failed', error: msg, progress: nextProgress, finished_at: new Date().toISOString() })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    const statusData = statusResult.data as { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }

    const cursorStatus = statusData.status ?? (run as any).cursor_status ?? 'RUNNING'
    const repoFullName = (run as any).repo_full_name as string
    const ticketPk = (run as any).ticket_pk as string | null
    const displayId = ((run as any).display_id as string) ?? ''
    const currentStage = (run as any).current_stage as string | null

    let nextStatus = 'polling'
    let nextStage: string | null = null
    let summary: string | null = null
    let prUrl: string | null = (run as any).pr_url ?? null
    let errMsg: string | null = null
    let finishedAt: string | null = null
    let processReviewSuggestions: Array<{ text: string; justification: string }> | null = null
    let conversationText: string | null = null

    if (cursorStatus === 'FINISHED') {
      nextStatus = 'finished'
      summary = statusData.summary ?? null
      prUrl = statusData.target?.prUrl ?? statusData.target?.pr_url ?? prUrl
      const branchName = statusData.target?.branchName
      if (!prUrl && repoFullName && branchName) {
        prUrl = `https://github.com/${repoFullName}/tree/${encodeURIComponent(branchName)}`
      }
      if (!prUrl && agentType === 'implementation') {
        console.warn('[agent-runs] FINISHED but no prUrl in Cursor response. target=', JSON.stringify(statusData.target))
      }
      finishedAt = new Date().toISOString()

      // Fetch conversation if needed
      const needsConversation =
        agentType === 'process-review' ||
        agentType === 'project-manager' ||
        agentType === 'qa' ||
        agentType === 'implementation' ||
        isPlaceholderSummary(summary)

      if (needsConversation) {
        conversationText = await fetchConversation(cursorAgentId, auth)
      }

      // Enrich summary from conversation if placeholder
      if (isPlaceholderSummary(summary) && conversationText) {
        const lastAssistant = getLastAssistantMessage(conversationText)
        if (lastAssistant) summary = lastAssistant
      }
      if (isPlaceholderSummary(summary)) summary = 'Completed.'

      summary = capText(summary, MAX_RUN_SUMMARY_CHARS)

      // Process process-review suggestions
      processReviewSuggestions = await processProcessReviewSuggestions(
        supabase,
        agentType,
        ticketPk,
        repoFullName,
        summary,
        conversationText
      )
    } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
      nextStatus = 'failed'
      errMsg = statusData.summary ?? `Agent ended with status ${cursorStatus}.`
      finishedAt = new Date().toISOString()
    }

    nextStage = determineNextStage(cursorStatus, currentStage, agentType)

    const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`) as ProgressEntry[]

    // Update worklog for implementation agents
    await upsertWorklog(supabase, agentType, displayId, repoFullName, ticketPk, progress, cursorStatus, summary, errMsg, prUrl)

    // Handle completed implementation: move to QA and upsert artifacts
    if (nextStatus === 'finished' && agentType === 'implementation' && ticketPk) {
      await handleCompletedImplementation(supabase, req, res, repoFullName, ticketPk, displayId, summary, prUrl)
    }

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
      json(res, 500, { error: `Supabase update failed: ${updErr.message}` })
      return
    }

    const payload = updated ?? run
    if (processReviewSuggestions != null) {
      json(res, 200, { ...(payload as object), suggestions: processReviewSuggestions })
      return
    }
    json(res, 200, payload)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}


import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import {
  fetchPullRequestFiles,
  generateImplementationArtifacts,
} from '../_lib/github/githubApi.js'
import { getServerSupabase, appendProgress, upsertArtifact, buildWorklogBodyFromProgress, type ProgressEntry } from './_shared.js'

type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

const MAX_RUN_SUMMARY_CHARS = 20_000

function getCursorApiKey(): string {
  const key = (process.env.CURSOR_API_KEY || process.env.VITE_CURSOR_API_KEY || '').trim()
  if (!key) throw new Error('Cursor API is not configured (CURSOR_API_KEY).')
  return key
}

function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 140)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function getQueryParam(req: IncomingMessage, name: string): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const v = url.searchParams.get(name)
    return v ? v : null
  } catch {
    return null
  }
}

function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

function isPlaceholderSummary(summary: string | null | undefined): boolean {
  const s = String(summary ?? '').trim()
  if (!s) return true
  return s === 'Completed.' || s === 'Done.' || s === 'Complete.' || s === 'Finished.'
}

function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as { messages?: Array<{ role?: string; content?: string }> }
    const messages = conv.messages ?? []
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content && String(m.content).trim())
    const content = (lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
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
    const shouldEnrichTerminalSummary =
      status === 'finished' &&
      !!cursorAgentId &&
      isPlaceholderSummary((run as any).summary as string | null)

    if ((status === 'finished' || status === 'failed') && !shouldEnrichTerminalSummary) {
      json(res, 200, run)
      return
    }

    if (!cursorAgentId) {
      json(res, 200, run)
      return
    }

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')

    const statusRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })
    const statusText = await statusRes.text()
    if (!statusRes.ok) {
      const msg = humanReadableCursorError(statusRes.status, statusText)
      const nextProgress = appendProgress((run as any).progress, `Poll failed: ${msg}`)
      await supabase
        .from('hal_agent_runs')
        .update({ status: 'failed', current_stage: 'failed', error: msg, progress: nextProgress, finished_at: new Date().toISOString() })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    let statusData: { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string; branchName?: string } }
    try {
      statusData = JSON.parse(statusText) as typeof statusData
    } catch {
      const msg = 'Invalid response when polling agent status.'
      const nextProgress = appendProgress((run as any).progress, msg)
      await supabase
        .from('hal_agent_runs')
        .update({ status: 'failed', current_stage: 'failed', error: msg, progress: nextProgress, finished_at: new Date().toISOString() })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    const cursorStatus = statusData.status ?? (run as any).cursor_status ?? 'RUNNING'
    const repoFullName = (run as any).repo_full_name as string
    const ticketPk = (run as any).ticket_pk as string | null
    const displayId = ((run as any).display_id as string) ?? ''
    const agentType = (run as any).agent_type as AgentType
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
      nextStage = 'completed'
      summary = statusData.summary ?? null
      prUrl = statusData.target?.prUrl ?? statusData.target?.pr_url ?? prUrl
      const repo = (run as any).repo_full_name as string
      const branchName = statusData.target?.branchName
      if (!prUrl && repo && branchName) {
        prUrl = `https://github.com/${repo}/tree/${encodeURIComponent(branchName)}`
      }
      if (!prUrl && agentType === 'implementation') console.warn('[agent-runs] FINISHED but no prUrl in Cursor response. target=', JSON.stringify(statusData.target))
      finishedAt = new Date().toISOString()

      // For all agent types: if summary is placeholder or empty, fetch last assistant message from conversation.
      // Also used by process-review to parse suggestions.
      const needsConversation =
        agentType === 'process-review' ||
        agentType === 'project-manager' ||
        agentType === 'qa' ||
        agentType === 'implementation' ||
        isPlaceholderSummary(summary)

      if (needsConversation) {
        try {
          const convRes = await fetch(`https://api.cursor.com/v0/agents/${cursorAgentId}/conversation`, {
            method: 'GET',
            headers: { Authorization: `Basic ${auth}` },
          })
          const text = await convRes.text()
          if (convRes.ok && text) conversationText = text
        } catch (e) {
          console.warn('[agent-runs] conversation fetch failed:', e instanceof Error ? e.message : e)
        }
      }

      if (isPlaceholderSummary(summary) && conversationText) {
        const lastAssistant = getLastAssistantMessage(conversationText)
        if (lastAssistant) summary = lastAssistant
      }
      if (isPlaceholderSummary(summary)) summary = 'Completed.'

      summary = capText(summary, MAX_RUN_SUMMARY_CHARS)

      // Process-review: fetch conversation, parse JSON suggestions, store in process_reviews
      if (agentType === 'process-review' && ticketPk) {
        if (conversationText) {
          try {
            const lastAssistantContent = getLastAssistantMessage(conversationText) ?? ''
            const jsonMatch = lastAssistantContent.match(/\[[\s\S]*\]/)
            const jsonStr = jsonMatch ? jsonMatch[0] : ''
            let suggestions: Array<{ text: string; justification: string }> = []
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr) as unknown[]
                if (Array.isArray(parsed)) {
                  suggestions = parsed
                    .filter((item): item is { text?: string; justification?: string } => item != null && typeof item === 'object')
                    .filter((item) => typeof item.text === 'string' && typeof item.justification === 'string')
                    .map((item) => ({ text: String(item.text).trim(), justification: String(item.justification).trim() }))
                }
              } catch {
                // ignore parse error
              }
            }
            processReviewSuggestions = suggestions
            const repoFullNameForReview = (run as any).repo_full_name as string
            await supabase.from('process_reviews').insert({
              ticket_pk: ticketPk,
              repo_full_name: repoFullNameForReview,
              suggestions,
              status: 'success',
              error_message: null,
            })
          } catch (e) {
            console.warn('[agent-runs] process-review conversation fetch/parse failed:', e instanceof Error ? e.message : e)
          }
        }
      }
    } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
      nextStatus = 'failed'
      nextStage = 'failed'
      errMsg = statusData.summary ?? `Agent ended with status ${cursorStatus}.`
      finishedAt = new Date().toISOString()
    } else {
      // While polling, keep current stage (running for implementation, reviewing for QA)
      // Don't update stage if it's already set to a valid polling stage
      const currentStage = (run as any).current_stage as string | null
      if (!currentStage || (currentStage !== 'running' && currentStage !== 'reviewing')) {
        nextStage = agentType === 'implementation' ? 'running' : 'reviewing'
      }
    }

    const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`) as ProgressEntry[]

    // Implementation runs: update worklog artifact on every poll (so we have a trail even if agent crashes)
    if (
      ((run as any).agent_type as AgentType) === 'implementation' &&
      repoFullName &&
      ticketPk
    ) {
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

      // When finished: move ticket to QA and upsert full artifact set (plan, changed-files, etc.) from PR when available
      if (nextStatus === 'finished') {
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
            // Only store artifacts with non-null body_md (skip error states)
            if (a.body_md === null) {
              console.warn(`[agent-runs] Skipping artifact "${a.title}" - ${a.error || 'data unavailable'}`)
              continue
            }
            const res = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', a.title, a.body_md)
            if (!res.ok) console.warn('[agent-runs] artifact upsert failed:', a.title, (res as { ok: false; error: string }).error)
          }
          // Log errors for artifacts that couldn't be generated (UI will show these as error states)
          if (errors.length > 0) {
            console.warn('[agent-runs] Some artifacts could not be generated:', errors.map((e) => `${e.artifactType}: ${e.reason}`).join('; '))
          }
        } catch (e) {
          console.warn('[agent-runs] finished artifact upsert error:', e instanceof Error ? e.message : e)
        }
      }
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


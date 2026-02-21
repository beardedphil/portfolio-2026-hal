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

function parseProcessReviewSuggestionsFromText(
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
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, context_bundle_id')
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
        // Prefer parsing suggestions from the Cursor summary (often contains the final assistant message).
        // If summary is missing/placeholder or not parseable, fall back to the conversation payload.
        const fromSummary = parseProcessReviewSuggestionsFromText(summary ?? '')
        const fromConversation = conversationText
          ? parseProcessReviewSuggestionsFromText(getLastAssistantMessage(conversationText) ?? '')
          : null
        const suggestions = fromSummary ?? fromConversation ?? []

        if (suggestions.length > 0 || fromSummary != null || fromConversation != null) {
          try {
            processReviewSuggestions = suggestions
            const repoFullNameForReview = (run as any).repo_full_name as string
            await supabase.from('process_reviews').insert({
              ticket_pk: ticketPk,
              repo_full_name: repoFullNameForReview,
              suggestions: suggestions,
              status: 'success',
              error_message: null,
            })
          } catch (e) {
            console.warn('[agent-runs] process-review conversation fetch/parse failed:', e instanceof Error ? e.message : e)
          }
        } else {
          // Could not parse suggestions from conversation. Try loading from existing process_reviews record.
          // This handles the case where suggestions were stored in a previous poll but parsing failed this time.
          try {
            const { data: existingReview } = await supabase
              .from('process_reviews')
              .select('suggestions, status')
              .eq('ticket_pk', ticketPk)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            
            if (existingReview && existingReview.status === 'success' && existingReview.suggestions && Array.isArray(existingReview.suggestions) && existingReview.suggestions.length > 0) {
              // Parse suggestions from database (may be stored as strings or objects)
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
                processReviewSuggestions = dbSuggestions
              }
            }
          } catch (e) {
            console.warn('[agent-runs] process-review database fallback failed:', e instanceof Error ? e.message : e)
          }
        }
      }
    } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
      nextStatus = 'failed'
      nextStage = 'failed'
      errMsg = statusData.summary ?? `Agent ended with status ${cursorStatus}.`
      finishedAt = new Date().toISOString()
    } else {
      // While polling, preserve intermediate stages (0690)
      // Only set to 'running'/'reviewing' if stage is null or an old/legacy value
      const currentStage = (run as any).current_stage as string | null
      // Valid intermediate stages that should be preserved:
      // - 'preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch', 'launching' (set by launch.ts)
      // - 'running' (implementation), 'reviewing' (QA) (set when agent is actively running)
      const validIntermediateStages = [
        'preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch', 
        'launching', 'running', 'reviewing'
      ]
      if (!currentStage || !validIntermediateStages.includes(currentStage)) {
        // Stage is null or an old/legacy value - set to appropriate polling stage
        nextStage = agentType === 'implementation' ? 'running' : 'reviewing'
      }
      // Otherwise, preserve the current stage (don't overwrite intermediate stages)
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
      // Note: 'completed' is the new status (replaces 'finished') (0690)
      if (nextStatus === 'completed') {
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

    // HAL-0748: Fetch context bundle checksum if bundle_id exists
    let contextBundleChecksum: string | null = null
    const contextBundleId = (run as any)?.context_bundle_id as string | null | undefined
    if (contextBundleId) {
      try {
        const { data: bundle, error: bundleErr } = await supabase
          .from('context_bundles')
          .select('content_checksum')
          .eq('bundle_id', contextBundleId)
          .maybeSingle()
        if (!bundleErr && bundle) {
          contextBundleChecksum = bundle.content_checksum as string | null
        }
      } catch (e) {
        // Log but don't fail - checksum is informational
        console.warn('[agent-runs/status] Failed to fetch bundle checksum:', e instanceof Error ? e.message : e)
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
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, current_stage, progress, created_at, updated_at, finished_at, context_bundle_id')
      .maybeSingle()

    if (updErr) {
      json(res, 500, { error: `Supabase update failed: ${updErr.message}` })
      return
    }

    const payload = updated ?? run
    const responsePayload = {
      ...(payload as object),
      ...(contextBundleChecksum ? { context_bundle_checksum: contextBundleChecksum } : {}),
      ...(processReviewSuggestions != null ? { suggestions: processReviewSuggestions } : {}),
    }
    json(res, 200, responsePayload)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}


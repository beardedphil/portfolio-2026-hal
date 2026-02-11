import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import {
  fetchPullRequestFiles,
  generateImplementationArtifacts,
} from '../_lib/github/githubApi.js'

type AgentType = 'implementation' | 'qa'

function getServerSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error('Supabase server env is missing (SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY).')
  }
  return createClient(url, key)
}

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

function appendProgress(progress: any[] | null | undefined, message: string) {
  const arr = Array.isArray(progress) ? progress.slice(-49) : []
  arr.push({ at: new Date().toISOString(), message })
  return arr
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
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, progress')
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

    // Terminal states: return without calling Cursor
    if (status === 'finished' || status === 'failed') {
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
        .update({ status: 'failed', error: msg, progress: nextProgress, finished_at: new Date().toISOString() })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    let statusData: { status?: string; summary?: string; target?: { prUrl?: string; pr_url?: string } }
    try {
      statusData = JSON.parse(statusText) as typeof statusData
    } catch {
      const msg = 'Invalid response when polling agent status.'
      const nextProgress = appendProgress((run as any).progress, msg)
      await supabase
        .from('hal_agent_runs')
        .update({ status: 'failed', error: msg, progress: nextProgress, finished_at: new Date().toISOString() })
        .eq('run_id', runId)
      json(res, 200, { ...(run as any), status: 'failed', error: msg, progress: nextProgress })
      return
    }

    const cursorStatus = statusData.status ?? (run as any).cursor_status ?? 'RUNNING'
    let nextStatus = 'polling'
    let summary: string | null = null
    let prUrl: string | null = (run as any).pr_url ?? null
    let errMsg: string | null = null
    let finishedAt: string | null = null

    if (cursorStatus === 'FINISHED') {
      nextStatus = 'finished'
      summary = statusData.summary ?? 'Completed.'
      prUrl = statusData.target?.prUrl ?? statusData.target?.pr_url ?? prUrl
      if (!prUrl) console.warn('[agent-runs] FINISHED but no prUrl in Cursor response. target=', JSON.stringify(statusData.target))
      finishedAt = new Date().toISOString()
    } else if (cursorStatus === 'FAILED' || cursorStatus === 'CANCELLED' || cursorStatus === 'ERROR') {
      nextStatus = 'failed'
      errMsg = statusData.summary ?? `Agent ended with status ${cursorStatus}.`
      finishedAt = new Date().toISOString()
    }

    const progress = appendProgress((run as any).progress, `Status: ${cursorStatus}`)

    // If finished and Implementation: move ticket to QA and insert artifact (best-effort)
    if (nextStatus === 'finished' && ((run as any).agent_type as AgentType) === 'implementation') {
      const repoFullName = (run as any).repo_full_name as string
      const ticketPk = (run as any).ticket_pk as string | null
      const displayId = (run as any).display_id as string ?? ''
      if (repoFullName && ticketPk) {
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
        // Insert implementation artifacts (plan, worklog, changed-files, decisions, verification, pm-review)
        // Generated from PR data and Cursor summary; stored in Supabase only (no repo docs/audit)
        let insertedArtifacts = false
        try {
          const ghToken =
            process.env.GITHUB_TOKEN?.trim() ||
            (await getSession(req, res).catch(() => null))?.github?.accessToken
          let prFiles: Array<{ filename: string; status: string; additions: number; deletions: number }> = []
          if (ghToken && prUrl) {
            const filesResult = await fetchPullRequestFiles(ghToken, prUrl)
            if ('files' in filesResult) prFiles = filesResult.files
            else if ('error' in filesResult) console.warn('[agent-runs] fetch PR files failed:', filesResult.error)
          } else if (!prUrl) {
            console.warn('[agent-runs] No prUrl available; artifacts will have empty changed-files')
          }
          const artifacts = generateImplementationArtifacts(
            displayId,
            summary ?? '',
            prUrl ?? '',
            prFiles
          )
          for (const a of artifacts) {
            const { data: existing } = await supabase
              .from('agent_artifacts')
              .select('artifact_id')
              .eq('ticket_pk', ticketPk)
              .eq('agent_type', 'implementation')
              .eq('title', a.title)
              .maybeSingle()
            if (!existing) {
              const { error: insErr } = await supabase.from('agent_artifacts').insert({
                ticket_pk: ticketPk,
                repo_full_name: repoFullName,
                agent_type: 'implementation',
                title: a.title,
                body_md: a.body_md,
              })
              if (insErr) console.error('[agent-runs] artifact insert failed:', a.title, insErr.message)
              else insertedArtifacts = true
            }
          }
        } catch (e) {
          console.warn('[agent-runs] artifact generation error:', e instanceof Error ? e.message : e)
        }
        // Fallback: if no artifacts were inserted (e.g. Supabase error), insert minimal summary
        if (!insertedArtifacts) {
          try {
            const artifactTitle = `Implementation report for ticket ${displayId}`
            const { data: existing } = await supabase
              .from('agent_artifacts')
              .select('artifact_id')
              .eq('ticket_pk', ticketPk)
              .eq('agent_type', 'implementation')
              .eq('title', artifactTitle)
              .maybeSingle()
            if (!existing) {
              let body = summary ?? 'Implementation completed.'
              if (prUrl) body += `\n\nPull request: ${prUrl}`
              body += `\n\nTicket ${displayId} implementation completed and moved to QA.`
              const { error: insErr } = await supabase.from('agent_artifacts').insert({
                ticket_pk: ticketPk,
                repo_full_name: repoFullName,
                agent_type: 'implementation',
                title: artifactTitle,
                body_md: body,
              })
              if (insErr) console.error('[agent-runs] fallback artifact insert failed:', insErr.message)
            }
          } catch (e) {
            console.error('[agent-runs] fallback artifact insert error:', e instanceof Error ? e.message : e)
          }
        }
      }
    }

    const { data: updated, error: updErr } = await supabase
      .from('hal_agent_runs')
      .update({
        cursor_status: cursorStatus,
        status: nextStatus,
        ...(summary != null ? { summary } : {}),
        ...(prUrl != null ? { pr_url: prUrl } : {}),
        ...(errMsg != null ? { error: errMsg } : {}),
        progress,
        ...(finishedAt ? { finished_at: finishedAt } : {}),
      })
      .eq('run_id', runId)
      .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, cursor_agent_id, cursor_status, pr_url, summary, error, status, progress, created_at, updated_at, finished_at')
      .maybeSingle()

    if (updErr) {
      json(res, 500, { error: `Supabase update failed: ${updErr.message}` })
      return
    }

    json(res, 200, updated ?? run)
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}


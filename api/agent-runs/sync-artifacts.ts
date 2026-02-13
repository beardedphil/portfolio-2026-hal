import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import { fetchPullRequestFiles, generateImplementationArtifacts } from '../_lib/github/githubApi.js'
import {
  getServerSupabase,
  upsertArtifact,
  buildWorklogBodyFromProgress,
  type ProgressEntry,
} from './_shared.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * POST /api/agent-runs/sync-artifacts
 * Body: { ticketPk: string }
 *
 * Backfills agent_artifacts for a ticket from the latest implementation run.
 * Use when the poll path didn't write (e.g. run already finished before deploy).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as { ticketPk?: string }
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : ''
    if (!ticketPk) {
      json(res, 400, { success: false, error: 'ticketPk is required' })
      return
    }

    const supabase = getServerSupabase()
    const { data: run, error: runErr } = await supabase
      .from('hal_agent_runs')
      .select('run_id, agent_type, repo_full_name, ticket_pk, display_id, status, progress, summary, pr_url, error')
      .eq('ticket_pk', ticketPk)
      .eq('agent_type', 'implementation')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (runErr) {
      console.warn('[agent-runs] sync-artifacts run fetch failed:', runErr.message)
      json(res, 500, { success: false, error: runErr.message })
      return
    }
    if (!run) {
      json(res, 200, { success: true, message: 'No implementation run found for this ticket' })
      return
    }

    const repoFullName = (run as any).repo_full_name as string
    const displayId = ((run as any).display_id as string) ?? ''
    const status = (run as any).status as string
    const progress = (Array.isArray((run as any).progress) ? (run as any).progress : []) as ProgressEntry[]
    const summary = (run as any).summary as string | null
    const prUrl = (run as any).pr_url as string | null
    const errMsg = (run as any).error as string | null
    const cursorStatus = status === 'finished' ? 'FINISHED' : status === 'failed' ? 'FAILED' : 'RUNNING'

    const worklogTitle = `Worklog for ticket ${displayId}`
    const worklogBody = buildWorklogBodyFromProgress(
      displayId,
      progress,
      cursorStatus,
      summary,
      errMsg,
      prUrl
    )
    const worklogResult = await upsertArtifact(
      supabase,
      ticketPk,
      repoFullName,
      'implementation',
      worklogTitle,
      worklogBody
    )
    if (worklogResult.ok === false) {
      const errMsg = worklogResult.error
      console.warn('[agent-runs] sync-artifacts worklog upsert failed:', errMsg)
      json(res, 500, { success: false, error: errMsg })
      return
    }

    if (status === 'finished') {
      const ghToken =
        process.env.GITHUB_TOKEN?.trim() ||
        (await getSession(req, res).catch(() => null))?.github?.accessToken
      let prFiles: Array<{ filename: string; status: string; additions: number; deletions: number }> = []
      if (ghToken && prUrl && /\/pull\/\d+/i.test(prUrl)) {
        const filesResult = await fetchPullRequestFiles(ghToken, prUrl)
        if ('files' in filesResult) prFiles = filesResult.files
      }
      const artifacts = generateImplementationArtifacts(
        displayId,
        summary ?? '',
        prUrl ?? '',
        prFiles
      )
      for (const a of artifacts) {
        // Skip artifacts with error states - they won't be inserted (0137)
        if (a.error) {
          console.log(`[agent-runs] sync-artifacts skipping artifact "${a.title}" - ${a.error}`)
          continue
        }
        const res2 = await upsertArtifact(supabase, ticketPk, repoFullName, 'implementation', a.title, a.body_md, a.error)
        if (res2.ok === false) console.warn('[agent-runs] sync-artifacts artifact upsert failed:', a.title, res2.error)
      }
    }

    // Return artifacts we just wrote so the UI can show them without relying on client Supabase read
    const { data: artifactRows, error: readErr } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: false })
    if (readErr) {
      console.warn('[agent-runs] sync-artifacts read-back failed:', readErr.message)
      json(res, 200, { success: true })
      return
    }
    json(res, 200, { success: true, artifacts: artifactRows ?? [] })
  } catch (err) {
    console.error('[agent-runs] sync-artifacts error:', err)
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

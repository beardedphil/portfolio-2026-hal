/**
 * Artifact and worklog handling functions
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import {
  fetchPullRequestFiles,
  generateImplementationArtifacts,
} from '../_lib/github/githubApi.js'
import { upsertArtifact, buildWorklogBodyFromProgress, type ProgressEntry } from './_shared.js'
import type { AgentType } from './status-helpers.js'

export async function updateWorklogArtifact(
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

export async function handleCompletedStatus(
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

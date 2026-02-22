import type { IncomingMessage, ServerResponse } from 'http'
import type { AgentType, TicketData } from './types.js'
import { getSession } from '../../_lib/github/session.js'
import { listBranches, ensureInitialCommit } from '../../_lib/github/githubApi.js'
import { getCursorApiKey, humanReadableCursorError, appendProgress, upsertArtifact, json } from '../_shared.js'
import { findExistingPrUrl } from './shared.js'

/** Bootstrap empty repository by creating initial commit. */
export async function bootstrapEmptyRepo(
  supabase: any,
  runId: string,
  initialProgress: any[],
  req: IncomingMessage,
  res: ServerResponse,
  repoFullName: string,
  defaultBranch: string
): Promise<boolean> {
  let ghToken: string | undefined
  try {
    const session = await getSession(req, res)
    ghToken = session.github?.accessToken
  } catch (sessionErr) {
    console.warn('[agent-runs/launch] Session unavailable (missing AUTH_SESSION_SECRET?):', sessionErr instanceof Error ? sessionErr.message : sessionErr)
  }
  if (!ghToken) return true

  const branchesResult = await listBranches(ghToken, repoFullName)
  if ('branches' in branchesResult && branchesResult.branches.length === 0) {
    const bootstrap = await ensureInitialCommit(ghToken, repoFullName, defaultBranch)
    if ('error' in bootstrap) {
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          current_stage: 'failed',
          error: `Repository has no branches and initial commit failed: ${bootstrap.error}. Ensure you have push access and try again.`,
          progress: appendProgress(initialProgress, `Bootstrap failed: ${bootstrap.error}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: bootstrap.error })
      return false
    }
  }
  return true
}

/** Update run stages based on agent type. */
export async function updateRunStages(
  supabase: any,
  runId: string,
  agentType: AgentType,
  initialProgress: any[],
  bodyMd: string
): Promise<void> {
  await supabase
    .from('hal_agent_runs')
    .update({
      current_stage: 'fetching_ticket',
      progress: appendProgress(initialProgress, 'Fetching ticket...'),
    })
    .eq('run_id', runId)

  if (agentType === 'qa') {
    const branchMatch = bodyMd.match(/##\s*QA[^\n]*\n[\s\S]*?Branch[:\s]+([^\n]+)/i)
    const branchName = branchMatch?.[1]?.trim()
    await supabase
      .from('hal_agent_runs')
      .update({
        current_stage: 'fetching_branch',
        progress: branchName
          ? appendProgress(initialProgress, `Finding branch: ${branchName}`)
          : appendProgress(initialProgress, 'Finding branch...'),
      })
      .eq('run_id', runId)
  }

  if (agentType === 'implementation') {
    await supabase
      .from('hal_agent_runs')
      .update({
        current_stage: 'resolving_repo',
        progress: appendProgress(initialProgress, 'Resolving repository...'),
      })
      .eq('run_id', runId)
  }
}

/** Launch Cursor agent and handle response. */
export async function launchCursorAgent(
  supabase: any,
  runId: string,
  initialProgress: any[],
  res: ServerResponse,
  promptText: string,
  repoFullName: string,
  defaultBranch: string,
  agentType: AgentType,
  ticketNumber: number,
  existingPrUrl: string | null,
  model: string
): Promise<{ success: true; cursorAgentId: string; cursorStatus: string } | { success: false }> {
  const cursorKey = getCursorApiKey()
  const auth = Buffer.from(`${cursorKey}:`).toString('base64')
  const repoUrl = `https://github.com/${repoFullName}`
  const branchName =
    agentType === 'implementation'
      ? `ticket/${String(ticketNumber).padStart(4, '0')}-implementation`
      : defaultBranch
  const target =
    agentType === 'implementation'
      ? existingPrUrl
        ? { branchName }
        : { autoCreatePr: true, branchName }
      : { branchName: defaultBranch }
  const promptTextForLaunch =
    agentType === 'implementation' && existingPrUrl
      ? `${promptText}\n\n## Existing PR linked\n\nA PR is already linked to this ticket:\n\n- ${existingPrUrl}\n\nDo NOT create a new PR. Push changes to the branch above so the existing PR updates.`
      : promptText

  const launchRes = await fetch('https://api.cursor.com/v0/agents', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: { text: promptTextForLaunch },
      source: { repository: repoUrl, ref: defaultBranch },
      target,
      ...(model ? { model } : {}),
    }),
  })

  const launchText = await launchRes.text()
  if (!launchRes.ok) {
    const branchNotFound =
      launchRes.status === 400 &&
      (/branch\s+.*\s+does not exist/i.test(launchText) || /does not exist.*branch/i.test(launchText))
    const msg = branchNotFound
      ? `The repository has no "${defaultBranch}" branch yet. If the repo is new and empty, create an initial commit and push (e.g. add a README) so the default branch exists, then try again.`
      : humanReadableCursorError(launchRes.status, launchText)
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        current_stage: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, `Launch failed: ${msg}`),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    json(res, 200, { runId, status: 'failed', error: msg })
    return { success: false }
  }

  let launchData: { id?: string; status?: string }
  try {
    launchData = JSON.parse(launchText) as typeof launchData
  } catch {
    const msg = 'Invalid response from Cursor API when launching agent.'
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        current_stage: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, msg),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    json(res, 200, { runId, status: 'failed', error: msg })
    return { success: false }
  }

  const cursorAgentId = launchData.id
  const cursorStatus = launchData.status ?? 'CREATING'
  if (!cursorAgentId) {
    const msg = 'Cursor API did not return an agent ID.'
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        current_stage: 'failed',
        error: msg,
        progress: appendProgress(initialProgress, msg),
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
    json(res, 200, { runId, status: 'failed', error: msg })
    return { success: false }
  }

  return { success: true, cursorAgentId, cursorStatus }
}

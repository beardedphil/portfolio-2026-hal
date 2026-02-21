/**
 * Core status processing logic
 */

import type { AgentType } from './status-helpers.js'

export function determineNextStage(
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

export function processStatusUpdate(
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

import { githubFetch } from './client.js'

export type CheckRunStatus = 'queued' | 'in_progress' | 'completed'
export type CheckRunConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null

export type CheckRun = {
  id: number
  name: string
  status: CheckRunStatus
  conclusion: CheckRunConclusion
  html_url: string
  check_suite?: {
    id: number
  }
}

export type CheckRunsResponse = {
  total_count: number
  check_runs: CheckRun[]
}

export type CiStatusSummary = {
  overall: 'passing' | 'failing' | 'pending' | 'running' | 'unknown'
  evaluatedSha: string
  requiredChecks: {
    unit: {
      status: CheckRunStatus
      conclusion: CheckRunConclusion | null
      name: string | null
      htmlUrl: string | null
    }
    e2e: {
      status: CheckRunStatus
      conclusion: CheckRunConclusion | null
      name: string | null
      htmlUrl: string | null
    }
  }
  failingCheckNames: string[]
  checksPageUrl: string
}

/**
 * Fetches check runs for a specific commit SHA.
 * @param token - GitHub access token
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sha - Commit SHA to check
 */
export async function fetchCheckRunsForCommit(
  token: string,
  owner: string,
  repo: string,
  sha: string
): Promise<{ checkRuns: CheckRun[] } | { error: string }> {
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}/check-runs`
    const data = await githubFetch<CheckRunsResponse>(token, url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
    return { checkRuns: Array.isArray(data.check_runs) ? data.check_runs : [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fetches a PR and returns its head SHA.
 * @param token - GitHub access token
 * @param prUrl - Full PR URL (e.g., https://github.com/owner/repo/pull/123)
 */
export async function fetchPrHeadSha(
  token: string,
  prUrl: string
): Promise<{ headSha: string; owner: string; repo: string; checksPageUrl: string } | { error: string }> {
  try {
    const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
    if (!m) return { error: 'Invalid PR URL' }
    const [, owner, repo, pullNumber] = m

    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`
    const pr = await githubFetch<{ head: { sha: string }; html_url?: string }>(token, url, { method: 'GET' })

    if (!pr.head?.sha) {
      return { error: 'PR head SHA not found' }
    }

    const checksPageUrl = pr.html_url ? `${pr.html_url}/checks` : `${prUrl}/checks`

    return {
      headSha: pr.head.sha,
      owner,
      repo,
      checksPageUrl,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Evaluates CI status for a PR by checking required checks (unit and e2e).
 * @param token - GitHub access token
 * @param prUrl - Full PR URL
 */
export async function evaluateCiStatus(
  token: string,
  prUrl: string
): Promise<CiStatusSummary | { error: string }> {
  try {
    // Get PR head SHA
    const prInfo = await fetchPrHeadSha(token, prUrl)
    if ('error' in prInfo) {
      return prInfo
    }

    const { headSha, owner, repo, checksPageUrl } = prInfo

    // Fetch check runs for the head SHA
    const checkRunsResult = await fetchCheckRunsForCommit(token, owner, repo, headSha)
    if ('error' in checkRunsResult) {
      return checkRunsResult
    }

    const checkRuns = checkRunsResult.checkRuns

    // Find required checks: unit and e2e
    // Check names are case-insensitive and may contain variations like "unit tests", "unit-tests", "e2e tests", etc.
    const unitCheck = checkRuns.find((run) => {
      const name = run.name.toLowerCase()
      return name.includes('unit') && (name.includes('test') || name.includes('check'))
    })

    const e2eCheck = checkRuns.find((run) => {
      const name = run.name.toLowerCase()
      return (name.includes('e2e') || name.includes('end-to-end')) && (name.includes('test') || name.includes('check'))
    })

    // Determine overall status
    const requiredChecks = [unitCheck, e2eCheck].filter(Boolean) as CheckRun[]
    const failingChecks = requiredChecks.filter(
      (run) => run.status === 'completed' && run.conclusion === 'failure'
    )
    const pendingChecks = requiredChecks.filter((run) => run.status === 'queued' || run.status === 'in_progress')
    const passingChecks = requiredChecks.filter(
      (run) => run.status === 'completed' && run.conclusion === 'success'
    )

    let overall: CiStatusSummary['overall']
    if (failingChecks.length > 0) {
      overall = 'failing'
    } else if (pendingChecks.length > 0) {
      overall = 'running'
    } else if (requiredChecks.length === 0) {
      overall = 'unknown'
    } else if (passingChecks.length === requiredChecks.length && requiredChecks.length >= 2) {
      overall = 'passing'
    } else {
      overall = 'unknown'
    }

    const failingCheckNames = failingChecks.map((run) => run.name)

    return {
      overall,
      evaluatedSha: headSha,
      requiredChecks: {
        unit: {
          status: unitCheck?.status || 'queued',
          conclusion: unitCheck?.conclusion || null,
          name: unitCheck?.name || null,
          htmlUrl: unitCheck?.html_url || null,
        },
        e2e: {
          status: e2eCheck?.status || 'queued',
          conclusion: e2eCheck?.conclusion || null,
          name: e2eCheck?.name || null,
          htmlUrl: e2eCheck?.html_url || null,
        },
      },
      failingCheckNames,
      checksPageUrl,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

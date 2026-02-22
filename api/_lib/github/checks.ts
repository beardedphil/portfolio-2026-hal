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

export type PullRequestInfo = {
  head: {
    sha: string
    ref: string
  }
  html_url: string
  number: number
}

/**
 * Fetch PR information including head SHA.
 * prUrl e.g. https://github.com/owner/repo/pull/123
 */
export async function fetchPullRequestInfo(
  token: string,
  prUrl: string
): Promise<{ pr: PullRequestInfo } | { error: string }> {
  try {
    const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
    if (!m) return { error: 'Invalid PR URL' }
    const [, owner, repo, pullNumber] = m
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`
    const data = await githubFetch<PullRequestInfo>(token, url, { method: 'GET' })
    return { pr: data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fetch check runs for a commit SHA.
 * Returns all check runs (including required checks like unit and e2e).
 */
export async function fetchCheckRunsForCommit(
  token: string,
  owner: string,
  repo: string,
  sha: string
): Promise<{ checkRuns: CheckRun[] } | { error: string }> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`
    const data = await githubFetch<CheckRunsResponse>(token, url, { method: 'GET' })
    return { checkRuns: Array.isArray(data.check_runs) ? data.check_runs : [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Evaluate CI status for a PR's head commit.
 * Checks required checks (unit, e2e) and returns overall status.
 */
export async function evaluateCiStatus(
  token: string,
  prUrl: string
): Promise<
  | {
      headSha: string
      overallStatus: 'passing' | 'failing' | 'pending' | 'running' | 'unknown'
      requiredChecks: Record<string, { status: string; name: string }>
      failingChecks: string[]
      checksUrl: string
    }
  | { error: string }
> {
  try {
    // Parse PR URL
    const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
    if (!m) return { error: 'Invalid PR URL' }
    const [, owner, repo, pullNumber] = m

    // Fetch PR info to get head SHA
    const prInfoResult = await fetchPullRequestInfo(token, prUrl)
    if ('error' in prInfoResult) {
      return { error: prInfoResult.error }
    }
    const { pr } = prInfoResult
    const headSha = pr.head.sha
    const checksUrl = `${pr.html_url}/checks`

    // Fetch check runs for the head commit
    const checkRunsResult = await fetchCheckRunsForCommit(token, owner, repo, headSha)
    if ('error' in checkRunsResult) {
      return { error: checkRunsResult.error }
    }
    const { checkRuns } = checkRunsResult

    // Required checks: unit and e2e
    const requiredCheckNames = ['unit', 'e2e']
    const requiredChecks: Record<string, { status: string; name: string }> = {}
    const failingChecks: string[] = []

    // Find required checks in the check runs
    for (const checkName of requiredCheckNames) {
      // Case-insensitive match for check names
      const matchingCheck = checkRuns.find(
        (run) => run.name.toLowerCase().includes(checkName.toLowerCase())
      )

      if (matchingCheck) {
        const status = matchingCheck.status === 'completed' 
          ? (matchingCheck.conclusion === 'success' ? 'passing' : 'failing')
          : matchingCheck.status === 'in_progress' || matchingCheck.status === 'queued'
          ? 'running'
          : 'unknown'
        
        requiredChecks[checkName] = {
          status,
          name: matchingCheck.name,
        }

        if (status === 'failing') {
          failingChecks.push(checkName)
        }
      } else {
        // Check not found - treat as unknown
        requiredChecks[checkName] = {
          status: 'unknown',
          name: checkName,
        }
      }
    }

    // Determine overall status
    let overallStatus: 'passing' | 'failing' | 'pending' | 'running' | 'unknown' = 'unknown'
    
    if (failingChecks.length > 0) {
      overallStatus = 'failing'
    } else {
      const allStatuses = Object.values(requiredChecks).map((c) => c.status)
      if (allStatuses.every((s) => s === 'passing')) {
        overallStatus = 'passing'
      } else if (allStatuses.some((s) => s === 'running')) {
        overallStatus = 'running'
      } else if (allStatuses.some((s) => s === 'pending')) {
        overallStatus = 'pending'
      } else {
        overallStatus = 'unknown'
      }
    }

    return {
      headSha,
      overallStatus,
      requiredChecks,
      failingChecks,
      checksUrl,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

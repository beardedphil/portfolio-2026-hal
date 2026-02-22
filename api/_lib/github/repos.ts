import { githubFetch } from './client.js'

export type GithubRepo = {
  id: number
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  pushed_at?: string | null
}

export async function listRepos(token: string, page = 1): Promise<GithubRepo[]> {
  const url = new URL('https://api.github.com/user/repos')
  url.searchParams.set('per_page', '100')
  url.searchParams.set('page', String(page))
  url.searchParams.set('sort', 'pushed')
  url.searchParams.set('direction', 'desc')
  url.searchParams.set('affiliation', 'owner,collaborator,organization_member')
  return githubFetch<GithubRepo[]>(token, url.toString(), { method: 'GET' })
}

export type GithubBranch = { name: string }

/** List branches in a repo. Returns [] for an empty repo. */
export async function listBranches(
  token: string,
  repoFullName: string
): Promise<{ branches: GithubBranch[] } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`
    const data = await githubFetch<GithubBranch[]>(token, url, { method: 'GET' })
    return { branches: Array.isArray(data) ? data : [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create the initial commit on the default branch for an empty repo (Contents API creates branch + commit).
 * Note: For empty repos, Contents API must be used as Git Database API requires at least one commit.
 * This function uses Contents API to initialize the repo, then returns the commit SHA.
 */
export async function ensureInitialCommit(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<{ ok: true; commitSha: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/README.md`
    const content = `# ${repo}\n\nInitialized by HAL.\n`
    const body = {
      message: 'Initial commit',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: defaultBranch,
      committer: { name: 'HAL', email: 'hal@localhost' },
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      // If file already exists (409), repo is not empty - that's okay, we'll get SHA from branch
      if (res.status === 409) {
        // Try to get the commit SHA from the branch instead
        const shaResult = await getBranchSha(token, repoFullName, defaultBranch)
        if ('error' in shaResult) {
          return { error: `Repository not empty but failed to get commit SHA: ${shaResult.error}` }
        }
        return { ok: true, commitSha: shaResult.sha }
      }
      return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = (await res.json()) as { commit: { sha: string } }
    return { ok: true, commitSha: data.commit.sha }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Get the default branch for a repository. */
export async function getDefaultBranch(
  token: string,
  repoFullName: string
): Promise<{ branch: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    const data = await githubFetch<{ default_branch: string }>(token, url, { method: 'GET' })
    return { branch: data.default_branch }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Get the SHA of a branch or commit. */
export async function getBranchSha(
  token: string,
  repoFullName: string,
  branch: string
): Promise<{ sha: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`
    const data = await githubFetch<{ object: { sha: string } }>(token, url, { method: 'GET' })
    return { sha: data.object.sha }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create a new branch from a base branch SHA. */
export async function createBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  baseSha: string
): Promise<{ ok: true; sha: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`
    const data = await githubFetch<{ ref: string; object: { sha: string } }>(token, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    })
    return { ok: true, sha: data.object.sha }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

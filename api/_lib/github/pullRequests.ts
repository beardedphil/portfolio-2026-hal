import { githubFetch } from './client.js'

export type PrFile = { 
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string | null // Unified diff patch (null for binary files or files too large)
}

export type PullRequest = {
  number: number
  html_url: string
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  draft: boolean
  state: string
}

/** Fetch PR files from GitHub. prUrl e.g. https://github.com/owner/repo/pull/123 */
export async function fetchPullRequestFiles(
  token: string,
  prUrl: string
): Promise<{ files: PrFile[] } | { error: string }> {
  try {
    const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
    if (!m) return { error: 'Invalid PR URL' }
    const [, owner, repo, pullNumber] = m
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`
    const data = await githubFetch<PrFile[]>(token, url, { method: 'GET' })
    return { files: Array.isArray(data) ? data : [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create a branch from the default branch (or specified base branch) */
export async function createBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  baseBranch: string = 'main'
): Promise<{ ok: true; branchName: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    // First, get the SHA of the base branch
    const refUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`
    const baseRef = await githubFetch<{ object: { sha: string } }>(token, refUrl, { method: 'GET' })
    
    // Create the new branch from the base branch SHA
    const createRefUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`
    const createBody = {
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    }
    
    await githubFetch<{ ref: string }>(token, createRefUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })
    
    return { ok: true, branchName }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create a draft pull request */
export async function createDraftPullRequest(
  token: string,
  repoFullName: string,
  title: string,
  head: string,
  base: string,
  body?: string
): Promise<{ pr: PullRequest } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
    const prBody = {
      title,
      head,
      base,
      body: body || '',
      draft: true,
    }
    
    const pr = await githubFetch<PullRequest>(token, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prBody),
    })
    
    return { pr }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Fetch unified git diff from PR files. Combines all file patches into a single unified diff. */
export async function fetchPullRequestDiff(
  token: string,
  prUrl: string
): Promise<{ diff: string } | { error: string }> {
  try {
    const filesResult = await fetchPullRequestFiles(token, prUrl)
    if ('error' in filesResult) {
      return { error: filesResult.error }
    }
    
    const files = filesResult.files
    if (files.length === 0) {
      return { error: 'No files changed in this PR' }
    }
    
    // Build unified diff from all file patches
    const diffParts: string[] = []
    
    for (const file of files) {
      // Skip binary files or files without patches
      if (!file.patch) {
        // For binary files, add a note
        diffParts.push(`diff --git a/${file.filename} b/${file.filename}`)
        diffParts.push(`Binary files differ`)
        diffParts.push('')
        continue
      }
      
      // Add file header if not already present in patch
      if (!file.patch.startsWith('diff --git')) {
        diffParts.push(`diff --git a/${file.filename} b/${file.filename}`)
        diffParts.push(`--- a/${file.filename}`)
        diffParts.push(`+++ b/${file.filename}`)
      }
      
      // Add the patch content
      diffParts.push(file.patch)
      diffParts.push('') // Empty line between files
    }
    
    const diff = diffParts.join('\n').trim()
    if (!diff) {
      return { error: 'No diff content available (all files may be binary or too large)' }
    }
    
    return { diff }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

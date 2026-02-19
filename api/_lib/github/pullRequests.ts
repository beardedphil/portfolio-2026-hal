import { githubFetch } from './client.js'

export type PrFile = { 
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string | null // Unified diff patch (null for binary files or files too large)
}

export type CreatePullRequestResponse = {
  html_url: string
  number: number
  head: { sha: string; ref: string }
  base: { sha: string; ref: string }
  draft: boolean
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

/** Get the SHA of a branch (or default branch if ref is not provided). */
export async function getRefSha(
  token: string,
  repoFullName: string,
  ref?: string
): Promise<{ sha: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    // If no ref provided, get default branch from repo info
    if (!ref) {
      const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      const repoData = await githubFetch<{ default_branch: string }>(token, repoUrl, { method: 'GET' })
      ref = repoData.default_branch || 'main'
    }
    
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`
    const data = await githubFetch<{ object: { sha: string } }>(token, url, { method: 'GET' })
    return { sha: data.object.sha }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create a branch from a base ref (default branch). */
export async function createBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  baseRef: string
): Promise<{ ok: true; sha: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    // Get base SHA
    const baseShaResult = await getRefSha(token, repoFullName, baseRef)
    if ('error' in baseShaResult) {
      return { error: `Failed to get base SHA: ${baseShaResult.error}` }
    }
    const baseSha = baseShaResult.sha
    
    // Create branch
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`
    const body = {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }
    const data = await githubFetch<{ ref: string; object: { sha: string } }>(token, url, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { ok: true, sha: data.object.sha }
  } catch (err) {
    // Check if branch already exists
    if (err instanceof Error && err.message.includes('already exists')) {
      // Branch exists, get its SHA
      const branchShaResult = await getRefSha(token, repoFullName, branchName)
      if ('error' in branchShaResult) {
        return { error: `Branch exists but failed to get SHA: ${branchShaResult.error}` }
      }
      return { ok: true, sha: branchShaResult.sha }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Create a draft pull request. */
export async function createDraftPullRequest(
  token: string,
  repoFullName: string,
  title: string,
  body: string,
  head: string,
  base: string
): Promise<{ pr: CreatePullRequestResponse } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
    const requestBody = {
      title,
      body,
      head,
      base,
      draft: true,
    }
    const data = await githubFetch<CreatePullRequestResponse>(token, url, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
    return { pr: data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

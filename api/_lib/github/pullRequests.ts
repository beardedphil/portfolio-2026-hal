import { githubFetch } from './client.js'

export type PrFile = { 
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string | null // Unified diff patch (null for binary files or files too large)
}

export type CreatePrResponse = {
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

/** Create a draft pull request. Returns PR URL, number, and commit SHAs. */
export async function createDraftPullRequest(
  token: string,
  repoFullName: string,
  title: string,
  body: string,
  headBranch: string,
  baseBranch: string
): Promise<{ pr: CreatePrResponse } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
    const data = await githubFetch<CreatePrResponse>(token, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        head: headBranch,
        base: baseBranch,
        draft: true,
      }),
    })
    
    return { pr: data }
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

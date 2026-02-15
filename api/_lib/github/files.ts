/** List directory contents in a repo. Uses default branch unless ref is provided. */
export async function listDirectoryContents(
  token: string,
  repoFullName: string,
  path: string,
  ref?: string
): Promise<{ entries: string[] } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) {
      return { error: 'Invalid repo: expected owner/repo' }
    }
    const apiPath = path === '' || path === '.' ? '' : path.endsWith('/') ? path : `${path}`
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`)
    if (ref) url.searchParams.set('ref', ref)
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 404) return { error: 'Directory not found' }
      return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = (await res.json()) as Array<{ name: string; type: 'file' | 'dir' }> | { type: 'file' }
    // GitHub API returns array for directories, object for single files
    if (Array.isArray(data)) {
      // Return just the names to match listDirectory format
      return {
        entries: data.map((item) => item.name),
      }
    }
    // Single file (shouldn't happen for directory listing, but handle gracefully)
    return { error: 'Path is a file, not a directory' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Fetch raw file contents from a repo. Uses default branch unless ref is provided. */
export async function fetchFileContents(
  token: string,
  repoFullName: string,
  path: string,
  maxLines = 500,
  ref?: string
): Promise<{ content: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) {
      return { error: 'Invalid repo: expected owner/repo' }
    }
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`)
    if (ref) url.searchParams.set('ref', ref)
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 404) return { error: 'File not found' }
      return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` }
    }
    const raw = await res.text()
    const lines = raw.split('\n')
    if (lines.length > maxLines) {
      return {
        content: lines.slice(0, maxLines).join('\n') + `\n\n... (truncated, ${lines.length - maxLines} more lines)`,
      }
    }
    return { content: raw }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

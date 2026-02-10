import { requireEnv } from './config.js'

export type GithubTokenResponse = {
  access_token: string
  token_type: string
  scope: string
}

export async function exchangeCodeForToken(args: {
  code: string
  redirectUri: string
}): Promise<GithubTokenResponse> {
  const clientId = requireEnv('GITHUB_CLIENT_ID')
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET')

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: args.code,
      redirect_uri: args.redirectUri,
    }),
  })

  const json = (await res.json().catch(() => null)) as
    | (GithubTokenResponse & { error?: string; error_description?: string })
    | null

  if (!res.ok || !json || !('access_token' in json)) {
    const msg = json?.error_description || json?.error || `GitHub token exchange failed (${res.status})`
    throw new Error(msg)
  }
  return json
}

export async function githubFetch<T>(
  token: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export type GithubUser = { login: string }

export async function getViewer(token: string): Promise<GithubUser> {
  return githubFetch<GithubUser>(token, 'https://api.github.com/user', { method: 'GET' })
}

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

/** List directory contents in a repo. Uses default branch. Returns format matching listDirectory tool. */
export async function listDirectoryContents(
  token: string,
  repoFullName: string,
  path: string
): Promise<{ entries: string[] } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) {
      return { error: 'Invalid repo: expected owner/repo' }
    }
    // GitHub Contents API: empty path or path ending with / lists directory
    const apiPath = path === '' || path === '.' ? '' : path.endsWith('/') ? path : `${path}`
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`
    const res = await fetch(url, {
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

/** Fetch raw file contents from a repo. Uses default branch. */
export async function fetchFileContents(
  token: string,
  repoFullName: string,
  path: string,
  maxLines = 500
): Promise<{ content: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) {
      return { error: 'Invalid repo: expected owner/repo' }
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    const res = await fetch(url, {
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

export type CodeSearchMatch = { path: string; line: number; text: string }

/** Extract a searchable term from a regex pattern for GitHub code search. */
function searchTermFromPattern(pattern: string): string {
  // GitHub search doesn't support regex; use first meaningful alphanumeric run
  const m = pattern.match(/[a-zA-Z0-9_]{2,}/)
  return m ? m[0] : pattern.replace(/[\\^$.*+?()[\]{}|]/g, '').slice(0, 50) || 'code'
}

/** Search code in a repo. Uses GitHub code search API. Returns up to 30 matches. */
export async function searchCode(
  token: string,
  repoFullName: string,
  pattern: string,
  _glob = '**/*'
): Promise<{ matches: CodeSearchMatch[] } | { error: string }> {
  try {
    const term = searchTermFromPattern(pattern)
    const q = `${encodeURIComponent(term)} repo:${repoFullName}`
    const url = `https://api.github.com/search/code?q=${q}&per_page=30`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.text-match+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 422) return { error: 'Invalid search pattern or repo not searchable' }
      return { error: `GitHub API ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = (await res.json()) as {
      items?: Array<{
        path?: string
        text_matches?: Array<{ fragment?: string }>
      }>
    }
    const matches: CodeSearchMatch[] = []
    for (const item of data.items ?? []) {
      const path = item.path ?? ''
      for (const tm of item.text_matches ?? []) {
        const fragment = (tm.fragment ?? '').trim().slice(0, 200)
        if (fragment) matches.push({ path, line: 0, text: fragment })
      }
      if (matches.length >= 30) break
    }
    return { matches: matches.slice(0, 30) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

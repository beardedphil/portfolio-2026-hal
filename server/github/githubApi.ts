import { requireEnv } from './config.ts'

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


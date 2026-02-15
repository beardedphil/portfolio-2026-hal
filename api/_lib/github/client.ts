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

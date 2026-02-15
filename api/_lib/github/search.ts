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

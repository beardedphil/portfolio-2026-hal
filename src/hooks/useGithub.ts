import { useState, useCallback, useEffect } from 'react'
import type { GithubAuthMe, GithubRepo, ConnectedGithubRepo } from '../types/app'

export function useGithub() {
  const [githubAuth, setGithubAuth] = useState<GithubAuthMe | null>(null)
  const [githubRepos, setGithubRepos] = useState<GithubRepo[] | null>(null)
  const [githubRepoPickerOpen, setGithubRepoPickerOpen] = useState(false)
  const [githubRepoQuery, setGithubRepoQuery] = useState('')
  const [connectedGithubRepo, setConnectedGithubRepo] = useState<ConnectedGithubRepo | null>(null)
  const [githubConnectError, setGithubConnectError] = useState<string | null>(null)

  const refreshGithubAuth = useCallback(async () => {
    try {
      setGithubConnectError(null)
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const text = await res.text()
      if (!res.ok) {
        setGithubAuth(null)
        setGithubConnectError(text.slice(0, 200) || 'Failed to check GitHub auth status.')
        // If auth fails and we have a restored repo in localStorage, clear it (0119: handle auth failure gracefully)
        try {
          const saved = localStorage.getItem('hal-github-repo')
          if (saved) {
            setConnectedGithubRepo(null)
            localStorage.removeItem('hal-github-repo')
          }
        } catch {
          // ignore
        }
        return
      }
      const json = JSON.parse(text) as GithubAuthMe
      setGithubAuth(json)
    } catch (err) {
      setGithubAuth(null)
      setGithubConnectError(err instanceof Error ? err.message : String(err))
      // If auth check fails and we have a restored repo in localStorage, clear it (0119: handle auth failure gracefully)
      try {
        const saved = localStorage.getItem('hal-github-repo')
        if (saved) {
          setConnectedGithubRepo(null)
          localStorage.removeItem('hal-github-repo')
        }
      } catch {
        // ignore
      }
    }
  }, [])

  // On load, check whether GitHub session already exists (0079)
  useEffect(() => {
    refreshGithubAuth().catch(() => {})
  }, [refreshGithubAuth])

  const loadGithubRepos = useCallback(async () => {
    try {
      setGithubConnectError(null)
      const res = await fetch('/api/github/repos', { credentials: 'include' })
      const text = await res.text()
      if (!res.ok) {
        setGithubRepos(null)
        setGithubConnectError(text.slice(0, 200) || 'Failed to load repos.')
        return
      }
      const json = JSON.parse(text) as { repos: GithubRepo[] }
      setGithubRepos(Array.isArray(json.repos) ? json.repos : [])
    } catch (err) {
      setGithubRepos(null)
      setGithubConnectError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleGithubConnect = useCallback(async () => {
    setGithubConnectError(null)
    // If already authenticated, open picker and load repos
    if (githubAuth?.authenticated) {
      setGithubRepoPickerOpen(true)
      if (!githubRepos) {
        await loadGithubRepos()
      }
      return
    }
    // Start OAuth flow (redirect)
    window.location.href = '/api/auth/github/start'
  }, [githubAuth?.authenticated, githubRepos, loadGithubRepos])

  const handleGithubDisconnect = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    setGithubAuth(null)
    setGithubRepos(null)
    setGithubRepoPickerOpen(false)
    setGithubRepoQuery('')
  }, [])

  // Restore connected GitHub repo from localStorage on load (0119: fix repo display after refresh)
  // Accept both fullName (camelCase) and full_name (snake_case) so restoration works regardless of save shape
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hal-github-repo')
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>
        const fullName =
          typeof parsed?.fullName === 'string'
            ? parsed.fullName.trim()
            : typeof (parsed as any)?.full_name === 'string'
              ? (parsed as any).full_name.trim()
              : ''
        if (fullName && fullName.includes('/')) {
          setConnectedGithubRepo({
            fullName,
            defaultBranch:
              typeof parsed?.defaultBranch === 'string'
                ? parsed.defaultBranch.trim()
                : typeof (parsed as any)?.default_branch === 'string'
                  ? (parsed as any).default_branch.trim()
                  : 'main',
            htmlUrl:
              typeof parsed?.htmlUrl === 'string'
                ? parsed.htmlUrl.trim()
                : typeof (parsed as any)?.html_url === 'string'
                  ? (parsed as any).html_url.trim()
                  : '',
            private: typeof (parsed as any)?.private === 'boolean' ? (parsed as any).private : false,
          })
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

  return {
    githubAuth,
    githubRepos,
    githubRepoPickerOpen,
    setGithubRepoPickerOpen,
    githubRepoQuery,
    setGithubRepoQuery,
    connectedGithubRepo,
    setConnectedGithubRepo,
    githubConnectError,
    refreshGithubAuth,
    loadGithubRepos,
    handleGithubConnect,
    handleGithubDisconnect,
  }
}

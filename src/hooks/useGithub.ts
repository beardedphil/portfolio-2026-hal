import { useState, useCallback, useEffect } from 'react'

export type GithubAuthMe = {
  authenticated: boolean
  login: string | null
  scope: string | null
}

export type GithubRepo = {
  id: number
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
}

export type ConnectedGithubRepo = {
  fullName: string
  defaultBranch: string
  htmlUrl: string
  private: boolean
}

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

  // Restore connected GitHub repo from localStorage on load (0119: fix repo display after refresh)
  // The repo state is restored for UI display; Kanban will receive the connection message when the iframe loads
  // Note: If GitHub auth fails, refreshGithubAuth will clear the restored repo
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hal-github-repo')
      if (saved) {
        const parsed = JSON.parse(saved) as ConnectedGithubRepo
        if (parsed?.fullName) {
          setConnectedGithubRepo(parsed)
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

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

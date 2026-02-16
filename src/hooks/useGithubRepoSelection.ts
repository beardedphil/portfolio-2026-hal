import { useCallback } from 'react'
import type { GithubRepo, ConnectedGithubRepo } from '../types/app'

interface UseGithubRepoSelectionParams {
  setConnectedGithubRepo: (repo: ConnectedGithubRepo) => void
  setConnectedProject: (project: string) => void
  supabaseUrl: string | null
  setSupabaseUrl: (url: string) => void
  supabaseAnonKey: string | null
  setSupabaseAnonKey: (key: string) => void
  setImplAgentRunStatus: (status: string) => void
  setImplAgentProgress: (progress: Array<{ timestamp: Date; message: string }>) => void
  setImplAgentError: (error: string | null) => void
  setQaAgentRunStatus: (status: string) => void
  setQaAgentProgress: (progress: Array<{ timestamp: Date; message: string }>) => void
  setQaAgentError: (error: string | null) => void
  loadConversationsForProject: (projectName: string) => Promise<void>
  setGithubRepoPickerOpen: (open: boolean) => void
}

export function useGithubRepoSelection({
  setConnectedGithubRepo,
  setConnectedProject,
  supabaseUrl,
  setSupabaseUrl,
  supabaseAnonKey,
  setSupabaseAnonKey,
  setImplAgentRunStatus,
  setImplAgentProgress,
  setImplAgentError,
  setQaAgentRunStatus,
  setQaAgentProgress,
  setQaAgentError,
  loadConversationsForProject,
  setGithubRepoPickerOpen,
}: UseGithubRepoSelectionParams) {
  const handleSelectGithubRepo = useCallback(
    (repo: GithubRepo) => {
      const selected: ConnectedGithubRepo = {
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        private: repo.private,
      }
      setConnectedGithubRepo(selected)
      try {
        localStorage.setItem('hal-github-repo', JSON.stringify(selected))
      } catch {
        // ignore
      }

      // Use repo full_name as the project id for persistence + ticket flows (0079)
      setConnectedProject(repo.full_name)

      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

      // If Supabase isn't set yet, use Vercel-provided VITE_ env as default (hosted path)
      if ((!supabaseUrl || !supabaseAnonKey) && url && key) {
        setSupabaseUrl(url)
        setSupabaseAnonKey(key)
      }

      // Restore agent status from localStorage (0097: preserve agent status across disconnect/reconnect)
      try {
        const savedImplStatus = localStorage.getItem('hal-impl-agent-status')
        if (
          savedImplStatus &&
          ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'running', 'completed', 'failed'].includes(
            savedImplStatus
          )
        ) {
          setImplAgentRunStatus(savedImplStatus)
        }
        const savedImplProgress = localStorage.getItem('hal-impl-agent-progress')
        if (savedImplProgress) {
          try {
            const parsed = JSON.parse(savedImplProgress) as Array<{ timestamp: string; message: string }>
            setImplAgentProgress(parsed.map((p) => ({ timestamp: new Date(p.timestamp), message: p.message })))
          } catch {
            // ignore parse errors
          }
        }
        const savedImplError = localStorage.getItem('hal-impl-agent-error')
        if (savedImplError) {
          setImplAgentError(savedImplError)
        }
        const savedQaStatus = localStorage.getItem('hal-qa-agent-status')
        if (
          savedQaStatus &&
          ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'reviewing', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(
            savedQaStatus
          )
        ) {
          setQaAgentRunStatus(savedQaStatus)
        }
        const savedQaProgress = localStorage.getItem('hal-qa-agent-progress')
        if (savedQaProgress) {
          try {
            const parsed = JSON.parse(savedQaProgress) as Array<{ timestamp: string; message: string }>
            setQaAgentProgress(parsed.map((p) => ({ timestamp: new Date(p.timestamp), message: p.message })))
          } catch {
            // ignore parse errors
          }
        }
        const savedQaError = localStorage.getItem('hal-qa-agent-error')
        if (savedQaError) {
          setQaAgentError(savedQaError)
        }
      } catch {
        // ignore localStorage errors
      }

      // Load conversations using the shared function (0124: refactored to avoid duplication)
      loadConversationsForProject(repo.full_name).catch((err) => {
        console.error('[HAL] Error loading conversations when selecting repo:', err)
      })

      setGithubRepoPickerOpen(false)
    },
    [
      setConnectedGithubRepo,
      setConnectedProject,
      supabaseUrl,
      setSupabaseUrl,
      supabaseAnonKey,
      setSupabaseAnonKey,
      setImplAgentRunStatus,
      setImplAgentProgress,
      setImplAgentError,
      setQaAgentRunStatus,
      setQaAgentProgress,
      setQaAgentError,
      loadConversationsForProject,
      setGithubRepoPickerOpen,
    ]
  )

  return { handleSelectGithubRepo }
}

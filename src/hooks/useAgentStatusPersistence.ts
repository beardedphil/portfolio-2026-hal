import { useEffect } from 'react'

const IMPL_AGENT_STATUS_KEY = 'hal-impl-agent-status'
const IMPL_AGENT_PROGRESS_KEY = 'hal-impl-agent-progress'
const IMPL_AGENT_ERROR_KEY = 'hal-impl-agent-error'
const IMPL_AGENT_RUN_ID_KEY = 'hal-impl-agent-run-id'
const QA_AGENT_STATUS_KEY = 'hal-qa-agent-status'
const QA_AGENT_PROGRESS_KEY = 'hal-qa-agent-progress'
const QA_AGENT_ERROR_KEY = 'hal-qa-agent-error'
const QA_AGENT_RUN_ID_KEY = 'hal-qa-agent-run-id'

interface UseAgentStatusPersistenceParams {
  implAgentRunStatus: string
  setImplAgentRunStatus: (status: string) => void
  implAgentRunId: string | null
  implAgentProgress: Array<{ timestamp: Date; message: string }>
  setImplAgentProgress: (progress: Array<{ timestamp: Date; message: string }>) => void
  implAgentError: string | null
  setImplAgentError: (error: string | null) => void
  qaAgentRunStatus: string
  setQaAgentRunStatus: (status: string) => void
  qaAgentRunId: string | null
  qaAgentProgress: Array<{ timestamp: Date; message: string }>
  setQaAgentProgress: (progress: Array<{ timestamp: Date; message: string }>) => void
  qaAgentError: string | null
  setQaAgentError: (error: string | null) => void
}

export function useAgentStatusPersistence({
  implAgentRunStatus,
  setImplAgentRunStatus,
  implAgentRunId,
  implAgentProgress,
  setImplAgentProgress,
  implAgentError,
  setImplAgentError,
  qaAgentRunStatus,
  setQaAgentRunStatus,
  qaAgentRunId,
  qaAgentProgress,
  setQaAgentProgress,
  qaAgentError,
  setQaAgentError,
}: UseAgentStatusPersistenceParams) {
  // Load persisted status on mount (0050)
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(IMPL_AGENT_STATUS_KEY)
      if (
        savedStatus &&
        ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'running', 'completed', 'failed'].includes(
          savedStatus
        )
      ) {
        setImplAgentRunStatus(savedStatus)
      }
      const savedProgress = localStorage.getItem(IMPL_AGENT_PROGRESS_KEY)
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress) as Array<{ timestamp: string; message: string }>
          setImplAgentProgress(parsed.map((p) => ({ timestamp: new Date(p.timestamp), message: p.message })))
        } catch {
          // ignore parse errors
        }
      }
      const savedError = localStorage.getItem(IMPL_AGENT_ERROR_KEY)
      if (savedError) {
        setImplAgentError(savedError)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [setImplAgentRunStatus, setImplAgentProgress, setImplAgentError])

  // Load persisted QA Agent status on mount (0062)
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(QA_AGENT_STATUS_KEY)
      if (
        savedStatus &&
        ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'reviewing', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(
          savedStatus
        )
      ) {
        setQaAgentRunStatus(savedStatus)
      }
      const savedProgress = localStorage.getItem(QA_AGENT_PROGRESS_KEY)
      if (savedProgress) {
        try {
          const parsed = JSON.parse(savedProgress) as Array<{ timestamp: string; message: string }>
          setQaAgentProgress(parsed.map((p) => ({ timestamp: new Date(p.timestamp), message: p.message })))
        } catch {
          // ignore parse errors
        }
      }
      const savedError = localStorage.getItem(QA_AGENT_ERROR_KEY)
      if (savedError) {
        setQaAgentError(savedError)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [setQaAgentRunStatus, setQaAgentProgress, setQaAgentError])
  // Save Implementation Agent status to localStorage whenever it changes (0050)
  useEffect(() => {
    try {
      if (implAgentRunStatus === 'idle') {
        localStorage.removeItem(IMPL_AGENT_STATUS_KEY)
      } else {
        localStorage.setItem(IMPL_AGENT_STATUS_KEY, implAgentRunStatus)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [implAgentRunStatus])

  useEffect(() => {
    try {
      if (!implAgentRunId) localStorage.removeItem(IMPL_AGENT_RUN_ID_KEY)
      else localStorage.setItem(IMPL_AGENT_RUN_ID_KEY, implAgentRunId)
    } catch {
      // ignore
    }
  }, [implAgentRunId])

  // Save progress to localStorage whenever it changes (0050)
  useEffect(() => {
    try {
      if (implAgentProgress.length === 0) {
        localStorage.removeItem(IMPL_AGENT_PROGRESS_KEY)
      } else {
        localStorage.setItem(
          IMPL_AGENT_PROGRESS_KEY,
          JSON.stringify(implAgentProgress.map((p) => ({ timestamp: p.timestamp.toISOString(), message: p.message })))
        )
      }
    } catch {
      // ignore localStorage errors
    }
  }, [implAgentProgress])

  // Save error to localStorage whenever it changes (0050)
  useEffect(() => {
    try {
      if (!implAgentError) {
        localStorage.removeItem(IMPL_AGENT_ERROR_KEY)
      } else {
        localStorage.setItem(IMPL_AGENT_ERROR_KEY, implAgentError)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [implAgentError])

  // Save QA Agent status to localStorage whenever it changes (0062)
  useEffect(() => {
    try {
      if (qaAgentRunStatus === 'idle') {
        localStorage.removeItem(QA_AGENT_STATUS_KEY)
      } else {
        localStorage.setItem(QA_AGENT_STATUS_KEY, qaAgentRunStatus)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [qaAgentRunStatus])

  useEffect(() => {
    try {
      if (!qaAgentRunId) localStorage.removeItem(QA_AGENT_RUN_ID_KEY)
      else localStorage.setItem(QA_AGENT_RUN_ID_KEY, qaAgentRunId)
    } catch {
      // ignore
    }
  }, [qaAgentRunId])

  // Save QA Agent progress to localStorage whenever it changes (0062)
  useEffect(() => {
    try {
      if (qaAgentProgress.length === 0) {
        localStorage.removeItem(QA_AGENT_PROGRESS_KEY)
      } else {
        localStorage.setItem(
          QA_AGENT_PROGRESS_KEY,
          JSON.stringify(qaAgentProgress.map((p) => ({ timestamp: p.timestamp.toISOString(), message: p.message })))
        )
      }
    } catch {
      // ignore localStorage errors
    }
  }, [qaAgentProgress])

  // Save QA Agent error to localStorage whenever it changes (0062)
  useEffect(() => {
    try {
      if (!qaAgentError) {
        localStorage.removeItem(QA_AGENT_ERROR_KEY)
      } else {
        localStorage.setItem(QA_AGENT_ERROR_KEY, qaAgentError)
      }
    } catch {
      // ignore localStorage errors
    }
  }, [qaAgentError])
}

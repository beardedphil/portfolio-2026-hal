import React, { useState, useCallback, useRef, useEffect } from 'react'
import { getSupabaseClient } from './lib/supabase'
import { saveConversationsToStorage, loadConversationsFromStorage, type Agent, type Message, type Conversation, type ImageAttachment } from './lib/conversationStorage'
// Chat width/collapse state no longer needed - floating widget replaces sidebar (0698)
import { getConversationId, parseConversationId, getNextInstanceNumber, formatTime, getMessageAuthorLabel } from './lib/conversation-helpers'
import { CoverageBadge } from './components/CoverageBadge'
import { SimplicityBadge } from './components/SimplicityBadge'
import { CoverageReportModal } from './components/CoverageReportModal'
import { SimplicityReportModal } from './components/SimplicityReportModal'
import type { Theme } from './types/hal'
import * as Kanban from 'portfolio-2026-kanban'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow, KanbanBoardProps } from 'portfolio-2026-kanban'
import 'portfolio-2026-kanban/style.css'
import { AgentInstructionsViewer } from './AgentInstructionsViewer'
import { PmChatWidget } from './components/PmChatWidget'
import {
  routeKanbanWorkButtonClick,
  type KanbanWorkButtonPayload,
} from './lib/kanbanWorkButtonRouting'
import { buildAgentRunsByTicketPk, pickMoreRelevantRun } from './lib/agentRuns'
import type { ChatTarget, ArtifactRow, GithubRepo, ConnectedGithubRepo } from './types/app'
import { CHAT_OPTIONS } from './types/app'
import { useGithub } from './hooks/useGithub'
import { useKanban } from './hooks/useKanban'
import { useConversations } from './hooks/useConversations'
import { useAgentRuns } from './hooks/useAgentRuns'
import { extractTicketId, formatTicketId } from './lib/ticketOperations'

const KanbanBoard = Kanban.default
// KANBAN_BUILD no longer used with floating widget (0698)
// const _kanbanBuild = (Kanban as unknown as { KANBAN_BUILD?: string }).KANBAN_BUILD
// const _KANBAN_BUILD: string = typeof _kanbanBuild === 'string' ? _kanbanBuild : 'unknown'

// DEBUG: QA option should be visible
console.log('CHAT_OPTIONS:', CHAT_OPTIONS.map(o => o.label))

function getEmptyConversations(): Map<string, Conversation> {
  return new Map()
}

function App() {
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget>('project-manager')
  // Selected conversation ID (0070) - null means showing conversation list
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  // openChatTarget no longer needed - floating widget replaces sidebar (0698)
  // const [openChatTarget, setOpenChatTarget] = useState<ChatTarget | string | null>(null)
  // Collapsible group states no longer needed - floating widget replaces sidebar (0698)
  const [conversations, setConversations] = useState<Map<string, Conversation>>(getEmptyConversations)
  const [inputValue, setInputValue] = useState('')
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sendValidationError, setSendValidationError] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  // These are used in logic but not displayed in UI with floating widget (0698)
  const [_lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [_persistenceError, setPersistenceError] = useState<string | null>(null)
  const [_conversationHistoryResetMessage, setConversationHistoryResetMessage] = useState<string | null>(null)
  const [_openaiLastStatus, setOpenaiLastStatus] = useState<string | null>(null)
  const [_openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  // Diagnostics panel no longer visible - floating widget replaces sidebar (0698)
  // const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [connectedProject, setConnectedProject] = useState<string | null>(null)
  // Theme is always 'dark' (HAL-0707: removed light/dark toggle)
  const theme: Theme = 'dark'
  // These are used in logic but not displayed in UI with floating widget (0698)
  const [_lastPmOutboundRequest, setLastPmOutboundRequest] = useState<object | null>(null)
  const [_lastPmToolCalls, setLastPmToolCalls] = useState<ToolCallRecord[] | null>(null)
  const [_lastTicketCreationResult, setLastTicketCreationResult] = useState<TicketCreationResult | null>(null)
  const [_lastCreateTicketAvailable, setLastCreateTicketAvailable] = useState<boolean | null>(null)
  const [_agentRunner, _setAgentRunner] = useState<string | null>(null)
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null)
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string | null>(null)
  const [_lastSendPayloadSummary, setLastSendPayloadSummary] = useState<string | null>(null)
  // GitHub integration via custom hook
  const github = useGithub()
  const {
    githubAuth,
    githubRepos,
    githubRepoPickerOpen,
    setGithubRepoPickerOpen,
    githubRepoQuery,
    setGithubRepoQuery,
    connectedGithubRepo,
    setConnectedGithubRepo,
    githubConnectError,
    handleGithubConnect,
    handleGithubDisconnect,
    loadGithubRepos,
  } = github
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false)
  const [agentInstructionsOpen, setAgentInstructionsOpen] = useState(false)
  const [promptModalMessage, setPromptModalMessage] = useState<Message | null>(null)
  /** QA quality metrics (0667) */
  /** Working memory for PM conversation (0173) - no longer displayed with floating widget (0698) */
  const [_pmWorkingMemory, _setPmWorkingMemory] = useState<{
    summary: string
    goals: string[]
    requirements: string[]
    constraints: string[]
    decisions: string[]
    assumptions: string[]
    open_questions: string[]
    glossary: Record<string, string>
    stakeholders: string[]
    updated_at: string
    through_sequence: number
  } | null>(null)
  const [_pmWorkingMemoryOpen, _setPmWorkingMemoryOpen] = useState(false)
  const [_pmWorkingMemoryLoading, _setPmWorkingMemoryLoading] = useState(false)
  const [_pmWorkingMemoryError, _setPmWorkingMemoryError] = useState<string | null>(null)
  
  // Working memory aliases removed - no longer used with floating widget (0698)
  
  const disconnectConfirmButtonRef = useRef<HTMLButtonElement>(null)
  const disconnectButtonRef = useRef<HTMLButtonElement>(null)
  // Diagnostics panels no longer visible - floating widget replaces sidebar (0698)
  const [_outboundRequestExpanded, _setOutboundRequestExpanded] = useState(false)
  const [_toolCallsExpanded, _setToolCallsExpanded] = useState(false)
  const messageIdRef = useRef(0)
  const pmMaxSequenceRef = useRef(0) // Keep for backward compatibility during migration
  // Track max sequence per agent instance (e.g., "project-manager-1", "implementation-agent-2")
  const agentSequenceRefs = useRef<Map<string, number>>(new Map())
  const transcriptRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState<string | null>(null) // conversationId loading older messages
  // MESSAGES_PER_PAGE is now provided by useConversations hook
  const selectedChatTargetRef = useRef<ChatTarget>(selectedChatTarget)
  
  // Load working memory when PM chat is selected and project is connected (0173) - moved after fetchPmWorkingMemory definition
  
  // Unread counts - setter still used in some places, but getter not needed with floating widget (0698)
  const [_unreadByTarget, setUnreadByTarget] = useState<Record<ChatTarget, number>>(() => ({
    'project-manager': 0,
    'implementation-agent': 0,
    'qa-agent': 0,
    'process-review-agent': 0,
  }))
  const [agentTypingTarget, setAgentTypingTarget] = useState<ChatTarget | null>(null)
  /** Implementation Agent run status for on-screen timeline (0044, 0046, 0050). */
  const [implAgentRunStatus, setImplAgentRunStatus] = useState<
    | 'idle'
    | 'preparing'
    | 'fetching_ticket'
    | 'resolving_repo'
    | 'launching'
    | 'polling'
    | 'running'
    | 'completed'
    | 'failed'
  >('idle')
  /** QA Agent run status for on-screen timeline. */
  const [processReviewStatus, setProcessReviewStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [processReviewTicketPk, setProcessReviewTicketPk] = useState<string | null>(null)
  
  /** Kanban data (HAL owns DB; fetches and passes to KanbanBoard). */
  const kanban = useKanban(supabaseUrl, supabaseAnonKey, connectedProject, {
    processReviewTicketPk,
    onTicketMovedToProcessReview: () => setProcessReviewStatus('idle'),
  })
  const {
    kanbanTickets,
    setKanbanTickets,
    kanbanColumns,
    kanbanAgentRunsByTicketPk,
    kanbanRealtimeStatus,
    kanbanLastSync,
    kanbanMoveError,
    setKanbanMoveError,
    fetchKanbanData,
    handleKanbanMoveTicket,
    handleKanbanReorderColumn,
    handleKanbanUpdateTicketBody,
    fetchArtifactsForTicket,
  } = kanban
  const [qaAgentRunStatus, setQaAgentRunStatus] = useState<
    | 'idle'
    | 'preparing'
    | 'fetching_ticket'
    | 'fetching_branch'
    | 'launching'
    | 'polling'
    | 'reviewing'
    | 'generating_report'
    | 'merging'
    | 'moving_ticket'
    | 'completed'
    | 'failed'
  >('idle')
  const IMPL_AGENT_RUN_ID_KEY = 'hal-impl-agent-run-id'
  const QA_AGENT_RUN_ID_KEY = 'hal-qa-agent-run-id'
  const [implAgentRunId, setImplAgentRunId] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem(IMPL_AGENT_RUN_ID_KEY)
      return v && v.trim() ? v.trim() : null
    } catch {
      return null
    }
  })
  const [qaAgentRunId, setQaAgentRunId] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem(QA_AGENT_RUN_ID_KEY)
      return v && v.trim() ? v.trim() : null
    } catch {
      return null
    }
  })
  /** Progress messages for Implementation Agent (0050). */
  const [implAgentProgress, setImplAgentProgress] = useState<Array<{ timestamp: Date; message: string }>>([])
  /** Last error message for Implementation Agent (0050). */
  const [implAgentError, setImplAgentError] = useState<string | null>(null)
  /** Current ticket ID for Implementation Agent (0061). */
  const [implAgentTicketId, setImplAgentTicketId] = useState<string | null>(null)
  /** Current ticket ID for QA Agent (0061). */
  const [qaAgentTicketId, setQaAgentTicketId] = useState<string | null>(null)
  /** Progress messages for QA Agent (0062). */
  const [qaAgentProgress, setQaAgentProgress] = useState<Array<{ timestamp: Date; message: string }>>([])
  /** Last error message for QA Agent (0062). */
  const [qaAgentError, setQaAgentError] = useState<string | null>(null)
  /** Process Review Agent run status for chat UI (0111). */
  const [processReviewAgentRunStatus, setProcessReviewAgentRunStatus] = useState<
    | 'idle'
    | 'preparing'
    | 'running'
    | 'completed'
    | 'failed'
  >('idle')
  /** Current ticket ID for Process Review Agent (0111). Used for tracking which ticket is being reviewed. */
  const [_processReviewAgentTicketId, setProcessReviewAgentTicketId] = useState<string | null>(null)
  /** Progress messages for Process Review Agent (0111). */
  const [processReviewAgentProgress, setProcessReviewAgentProgress] = useState<Array<{ timestamp: Date; message: string }>>([])
  /** Last error message for Process Review Agent (0111). */
  const [_processReviewAgentError, setProcessReviewAgentError] = useState<string | null>(null)
  /** Process Review recommendations modal state (0484). */
  const [processReviewRecommendations, setProcessReviewRecommendations] = useState<Array<{
    text: string
    justification: string
    id: string // Unique ID for tracking
    error?: string // Error state for failed ticket creation
    isCreating?: boolean // Loading state for Implement button
  }> | null>(null)
  const [processReviewModalTicketPk, setProcessReviewModalTicketPk] = useState<string | null>(null)
  const [processReviewModalTicketId, setProcessReviewModalTicketId] = useState<string | null>(null)
  const [processReviewModalReviewId, setProcessReviewModalReviewId] = useState<string | null>(null)
  /** Auto-move diagnostics entries (0061) - no longer displayed with floating widget (0698). */
  const [_autoMoveDiagnostics, setAutoMoveDiagnostics] = useState<Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>>([])
  /** Agent type that initiated the current Cursor run (0067). Used to route completion summaries to the correct chat. */
  const [cursorRunAgentType, setCursorRunAgentType] = useState<Agent | null>(null)
  /** Raw completion summary for troubleshooting when agent type is missing (0067). */
  // Orphaned completion summary - no longer displayed with floating widget (0698)
  const [_orphanedCompletionSummary, setOrphanedCompletionSummary] = useState<string | null>(null)
  /** Floating PM chat widget state (0698). */
  const [pmChatWidgetOpen, setPmChatWidgetOpen] = useState<boolean>(false)
  const [pmChatWidgetFullscreen, setPmChatWidgetFullscreen] = useState<boolean>(false)
  /** Coverage and Simplicity report modals (0693). */
  const [coverageReportOpen, setCoverageReportOpen] = useState<boolean>(false)
  const [simplicityReportOpen, setSimplicityReportOpen] = useState<boolean>(false)

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
    // Close prompt modal when switching away from Project Manager (0202)
    if (selectedChatTarget !== 'project-manager') {
      setPromptModalMessage(null)
    }
  }, [selectedChatTarget])

  // Apply dark theme to document root on mount (HAL-0707: removed light/dark toggle)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  // Restore connected GitHub repo from localStorage on load (0119: fix repo display after refresh)
  // The repo state is restored for UI display; Kanban will receive the connection message when the iframe loads
  // Note: GitHub hook handles repo restoration, but we need to set connectedProject here
  useEffect(() => {
    if (connectedGithubRepo?.fullName) {
      setConnectedProject(connectedGithubRepo.fullName)
    }
  }, [connectedGithubRepo])

  // GitHub integration handled by useGithub hook

  // Conversation management via custom hook
  const conversationsHook = useConversations(
    supabaseUrl,
    supabaseAnonKey,
    setSupabaseUrl,
    setSupabaseAnonKey,
    setConversations,
    setPersistenceError,
    setConversationHistoryResetMessage,
    agentSequenceRefs,
    pmMaxSequenceRef,
    messageIdRef
  )
  const { loadConversationsForProject, MESSAGES_PER_PAGE } = conversationsHook

  // loadConversationsForProject is now provided by useConversations hook

  const handleSelectGithubRepo = useCallback((repo: GithubRepo) => {
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
      if (savedImplStatus && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'running', 'completed', 'failed'].includes(savedImplStatus)) {
        setImplAgentRunStatus(savedImplStatus as typeof implAgentRunStatus)
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
      if (savedQaStatus && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'reviewing', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(savedQaStatus)) {
        setQaAgentRunStatus(savedQaStatus as typeof qaAgentRunStatus)
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
  }, [supabaseUrl, supabaseAnonKey, loadConversationsForProject])

  // Persist selected conversation to localStorage (0124: restore last-open conversation on refresh)
  useEffect(() => {
    if (connectedProject && selectedConversationId) {
      try {
        localStorage.setItem(`hal-selected-conversation-${connectedProject}`, selectedConversationId)
      } catch {
        // ignore localStorage errors
      }
    }
  }, [connectedProject, selectedConversationId])

  // Restore selected conversation after conversations are loaded (0124: restore last-open conversation on refresh)
  const restoredSelectedConvRef = useRef<string | null>(null)
  useEffect(() => {
    if (connectedProject && conversations.size > 0 && !restoredSelectedConvRef.current) {
      try {
        const savedSelectedConv = localStorage.getItem(`hal-selected-conversation-${connectedProject}`)
        if (savedSelectedConv && conversations.has(savedSelectedConv)) {
          setSelectedConversationId(savedSelectedConv)
          restoredSelectedConvRef.current = savedSelectedConv
        }
      } catch {
        // ignore localStorage errors
      }
    } else if (!connectedProject) {
      restoredSelectedConvRef.current = null
    }
  }, [connectedProject, conversations, selectedConversationId])

  // Load conversations when connectedProject is restored on page refresh (0124: fix chat clearing on refresh)
  // CRITICAL: This must run immediately when connectedProject is set, regardless of Supabase credentials
  // We use a ref to track if we've already loaded for this project to avoid duplicate loads
  const loadedProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (connectedProject && loadedProjectRef.current !== connectedProject) {
      loadedProjectRef.current = connectedProject
      restoredSelectedConvRef.current = null // Reset restoration flag when project changes
      // Load conversations immediately - loadConversationsForProject handles localStorage first, then Supabase
      // This ensures conversations are visible immediately on page refresh, even before Supabase loads
      loadConversationsForProject(connectedProject).catch((err) => {
        console.error('[HAL] Error loading conversations on page refresh:', err)
      })
    } else if (!connectedProject) {
      // Reset ref when disconnected
      loadedProjectRef.current = null
      restoredSelectedConvRef.current = null
    }
  }, [connectedProject, loadConversationsForProject])


  // Auto-expand groups no longer needed - floating widget replaces sidebar (0698)

  // No longer needed - floating chat widget replaces sidebar (0698)

  // Persist Implementation Agent status to localStorage (0050)
  const IMPL_AGENT_STATUS_KEY = 'hal-impl-agent-status'
  const IMPL_AGENT_PROGRESS_KEY = 'hal-impl-agent-progress'
  const IMPL_AGENT_ERROR_KEY = 'hal-impl-agent-error'
  // Persist QA Agent status to localStorage (0062)
  const QA_AGENT_STATUS_KEY = 'hal-qa-agent-status'
  const QA_AGENT_PROGRESS_KEY = 'hal-qa-agent-progress'
  const QA_AGENT_ERROR_KEY = 'hal-qa-agent-error'

  // Load persisted status on mount (0050)
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(IMPL_AGENT_STATUS_KEY)
      if (savedStatus && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'running', 'completed', 'failed'].includes(savedStatus)) {
        setImplAgentRunStatus(savedStatus as typeof implAgentRunStatus)
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
  }, [])

  // Load persisted QA Agent status on mount (0062)
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(QA_AGENT_STATUS_KEY)
      if (savedStatus && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'reviewing', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(savedStatus)) {
        setQaAgentRunStatus(savedStatus as typeof qaAgentRunStatus)
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
  }, [])

  // Save status to localStorage whenever it changes (0050)
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

  // Fetch working memory when PM conversation changes (0173) - moved after fetchPmWorkingMemory definition
  // (This useEffect is defined later after fetchPmWorkingMemory is declared)

  // Get active messages from selected conversation (0070)
  // For PM, always use default conversation; for Implementation/QA, use selected conversation if modal is open
  const activeMessages = (() => {
    if (selectedChatTarget === 'project-manager') {
      const defaultConvId = getConversationId('project-manager', 1)
      return conversations.has(defaultConvId) ? conversations.get(defaultConvId)!.messages : []
    }
    if (selectedConversationId && conversations.has(selectedConversationId)) {
      return conversations.get(selectedConversationId)!.messages
    }
    return []
  })()

  // PM chat transcript is always PM-only (HAL-0700)
  const pmMessages = (() => {
    const defaultConvId = getConversationId('project-manager', 1)
    return conversations.has(defaultConvId) ? conversations.get(defaultConvId)!.messages : []
  })()

  // Get conversations for a specific agent role - removed, no longer used with floating widget (0698)

  // Get conversation label - removed, no longer used with floating widget (0698)

  // Get preview text from last message - removed, no longer used with floating widget (0698)

  // Get preview text for PM chat - removed, no longer used with floating widget (0698)

  // formatTicketId is now imported from ./lib/ticketOperations

  // Fetch working memory - removed, no longer used with floating widget (0698)

  // Load older messages for a conversation (pagination)
  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      if (!connectedProject || !supabaseUrl || !supabaseAnonKey) return
      if (loadingOlderMessages === conversationId) return // Already loading
      
      const conv = conversations.get(conversationId)
      if (!conv || !conv.hasMoreMessages || conv.oldestLoadedSequence === undefined) return
      
      setLoadingOlderMessages(conversationId)
      
      try {
        const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)
        const { data: rows, error } = await supabase
          .from('hal_conversation_messages')
          .select('agent, role, content, sequence, created_at, images')
          .eq('project_id', connectedProject)
          .eq('agent', conversationId)
          .lt('sequence', conv.oldestLoadedSequence!)
          .order('sequence', { ascending: false })
          .limit(MESSAGES_PER_PAGE)
        
        if (error) {
          console.error('[HAL] Failed to load older messages:', error)
          setLoadingOlderMessages(null)
          return
        }
        
        if (rows && rows.length > 0) {
          const olderMessages: Message[] = rows.reverse().map((row) => ({
            id: row.sequence as number,
            agent: row.role === 'user' ? 'user' : (conv.agentRole),
            content: row.content ?? '',
            timestamp: row.created_at ? new Date(row.created_at) : new Date(),
            imageAttachments: undefined,
          }))
          
          // Preserve scroll position
          const transcript = transcriptRef.current
          const scrollHeightBefore = transcript?.scrollHeight ?? 0
          const scrollTopBefore = transcript?.scrollTop ?? 0
          
          // Update conversation with older messages prepended
          setConversations((prev) => {
            const next = new Map(prev)
            const existingConv = next.get(conversationId)
            if (!existingConv) return next
            
            const allMessages = [...olderMessages, ...existingConv.messages].sort((a, b) => a.id - b.id)
            const newOldestSeq = Math.min(...allMessages.map(m => m.id))
            const hasMore = olderMessages.length >= MESSAGES_PER_PAGE
            
            next.set(conversationId, {
              ...existingConv,
              messages: allMessages,
              oldestLoadedSequence: newOldestSeq,
              hasMoreMessages: hasMore,
            })
            return next
          })
          
          // Restore scroll position after messages are added
          requestAnimationFrame(() => {
            if (transcript) {
              const scrollHeightAfter = transcript.scrollHeight
              const scrollDiff = scrollHeightAfter - scrollHeightBefore
              transcript.scrollTop = scrollTopBefore + scrollDiff
            }
          })
        } else {
          // No more messages
          setConversations((prev) => {
            const next = new Map(prev)
            const existingConv = next.get(conversationId)
            if (existingConv) {
              next.set(conversationId, {
                ...existingConv,
                hasMoreMessages: false,
              })
            }
            return next
          })
        }
        
        setLoadingOlderMessages(null)
      } catch (err) {
        console.error('[HAL] Failed to load older messages:', err)
        setLoadingOlderMessages(null)
      }
    },
    [connectedProject, supabaseUrl, supabaseAnonKey, conversations, loadingOlderMessages]
  )

  // Auto-scroll transcript to bottom when messages or typing indicator change (but not when loading older messages)
  useEffect(() => {
    if (transcriptRef.current && !loadingOlderMessages) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [activeMessages, agentTypingTarget, selectedConversationId, implAgentRunStatus, qaAgentRunStatus, processReviewAgentRunStatus, implAgentProgress, qaAgentProgress, processReviewAgentProgress, loadingOlderMessages])

  // Auto-scroll PM chat transcript to bottom when widget opens (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && messagesEndRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight
        }
      })
    }
  }, [pmChatWidgetOpen])

  // Auto-scroll PM chat transcript to bottom when PM messages change (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && messagesEndRef.current && !loadingOlderMessages) {
      // Use requestAnimationFrame to ensure DOM is fully rendered after message updates
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight
        }
      })
    }
  }, [pmMessages, pmChatWidgetOpen, agentTypingTarget, loadingOlderMessages])

  // Auto-scroll Project Manager chat to bottom when widget opens or when switching to PM chat (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && selectedChatTarget === 'project-manager' && transcriptRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated and layout is complete
      requestAnimationFrame(() => {
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
      })
    }
  }, [pmChatWidgetOpen, selectedChatTarget, pmMessages])

  // Detect scroll to top and load older messages
  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return
    
    const handleScroll = () => {
      // Load more when scrolled within 100px of top
      if (transcript.scrollTop < 100) {
        const currentConvId = selectedConversationId || (selectedChatTarget === 'project-manager' ? getConversationId('project-manager', 1) : null)
        if (currentConvId) {
          const conv = conversations.get(currentConvId)
          if (conv && conv.hasMoreMessages && loadingOlderMessages !== currentConvId) {
            loadOlderMessages(currentConvId)
          }
        }
      }
    }
    
    transcript.addEventListener('scroll', handleScroll)
    return () => transcript.removeEventListener('scroll', handleScroll)
  }, [selectedConversationId, selectedChatTarget, conversations, loadOlderMessages, loadingOlderMessages])

  // Persist conversations to Supabase (0124: save ALL conversations to Supabase when connected, fallback to localStorage)
  // 0097: ALWAYS save to localStorage as backup, even when Supabase is available, to ensure conversations persist across disconnect/reconnect
  useEffect(() => {
    if (!connectedProject) return
    const useSupabase = supabaseUrl != null && supabaseAnonKey != null
    
    // ALWAYS save to localStorage first (synchronously) as backup (0097: ensure conversations persist even if Supabase fails or is slow)
    const localStorageResult = saveConversationsToStorage(connectedProject, conversations)
    if (!localStorageResult.success && localStorageResult.error) {
      setPersistenceError(localStorageResult.error)
    }
    
    // Also save to Supabase if available (async, for cross-device persistence)
    if (useSupabase) {
      // Save ALL conversations to Supabase (0124)
      ;(async () => {
        try {
          const supabase = getSupabaseClient(supabaseUrl!, supabaseAnonKey!)
          
          // For each conversation, save new messages that aren't yet in Supabase
          for (const [convId, conv] of conversations.entries()) {
            const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
            
            // Find messages that need to be saved (sequence > currentMaxSeq)
            // Filter out system messages - they are ephemeral and use fractional IDs that can't be stored as integers
            const messagesToSave = conv.messages.filter(msg => msg.id > currentMaxSeq && msg.agent !== 'system')
            
            if (messagesToSave.length > 0) {
              // Insert new messages into Supabase
              const inserts = messagesToSave.map(msg => ({
                project_id: connectedProject,
                agent: convId, // Use conversation ID as agent field (e.g., "project-manager-1", "implementation-agent-2")
                role: msg.agent === 'user' ? 'user' : (msg.agent === 'system' ? 'system' : 'assistant'),
                content: msg.content,
                sequence: msg.id,
                created_at: msg.timestamp.toISOString(),
                images: msg.imageAttachments ? msg.imageAttachments.map(img => ({
                  dataUrl: img.dataUrl,
                  filename: img.filename,
                  mimeType: img.file?.type || 'image/png',
                })) : null,
              }))
              
              const { error } = await supabase.from('hal_conversation_messages').insert(inserts)
              
              if (error) {
                console.error(`[HAL] Failed to save messages for conversation ${convId}:`, error)
                // Don't overwrite localStorage error if it exists, but show Supabase error
                setPersistenceError((prev) => prev || `DB: ${error.message}`)
              } else {
                // Update max sequence for this conversation
                const newMaxSeq = Math.max(...messagesToSave.map(m => m.id), currentMaxSeq)
                agentSequenceRefs.current.set(convId, newMaxSeq)
                
                // Backward compatibility: update pmMaxSequenceRef for PM conversations
                if (conv.agentRole === 'project-manager' && conv.instanceNumber === 1) {
                  pmMaxSequenceRef.current = newMaxSeq
                }
                
                // Clear error only if localStorage save succeeded
                if (localStorageResult.success) {
                  setPersistenceError(null)
                }
              }
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[HAL] Error persisting conversations to Supabase:', err)
          // Don't overwrite localStorage error if it exists, but show Supabase error
          setPersistenceError((prev) => prev || `DB: ${errMsg}`)
        }
      })()
    } else {
      // No Supabase: localStorage save already done above, just clear error if successful
      if (localStorageResult.success) {
        setPersistenceError(null)
      }
    }
  }, [conversations, connectedProject, supabaseUrl, supabaseAnonKey])

  /** Add auto-move diagnostic entry (0061). */
  const addAutoMoveDiagnostic = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    setAutoMoveDiagnostics((prev) => [...prev, { timestamp: new Date(), message, type }])
  }, [])

  // extractTicketId is now imported from ./lib/ticketOperations

  /** Move ticket to next column via Supabase (0061). */
  const moveTicketToColumn = useCallback(
    async (ticketId: string, targetColumnId: string, agentType: 'implementation' | 'qa'): Promise<{ success: boolean; error?: string }> => {
      if (!supabaseUrl || !supabaseAnonKey) {
        const error = `Cannot move ticket ${ticketId}: Supabase credentials not available. Connect project folder to enable auto-move.`
        addAutoMoveDiagnostic(error, 'error')
        return { success: false, error }
      }

      try {
        const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)

        // Get max position in target column
        const { data: inColumn, error: fetchErr } = await supabase
          .from('tickets')
          .select('kanban_position')
          .eq('kanban_column_id', targetColumnId)
          .order('kanban_position', { ascending: false })
          .limit(1)

        if (fetchErr) {
          const error = `Failed to fetch tickets in target column ${targetColumnId} for ticket ${ticketId}: ${fetchErr.message}`
          addAutoMoveDiagnostic(error, 'error')
          return { success: false, error }
        }

        const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
        const movedAt = new Date().toISOString()

        // Update ticket column
        const { error: updateErr } = await supabase
          .from('tickets')
          .update({
            kanban_column_id: targetColumnId,
            kanban_position: nextPosition,
            kanban_moved_at: movedAt,
          })
          .eq('id', ticketId)

        if (updateErr) {
          const error = `Failed to move ticket ${ticketId} to ${targetColumnId}: ${updateErr.message}`
          addAutoMoveDiagnostic(error, 'error')
          return { success: false, error }
        }

        // Note: sync-tickets is handled by the backend when tickets are moved via the agent endpoints
        // This frontend move is a fallback/automatic move, so we rely on the Kanban board's polling to reflect the change
        const info = `${agentType === 'implementation' ? 'Implementation' : 'QA'} Agent: Moved ticket ${ticketId} to ${targetColumnId}`
        addAutoMoveDiagnostic(info, 'info')
        return { success: true }
      } catch (err) {
        const error = `Failed to move ticket ${ticketId} to ${targetColumnId}: ${err instanceof Error ? err.message : String(err)}`
        addAutoMoveDiagnostic(error, 'error')
        return { success: false, error }
      }
    },
    [supabaseUrl, supabaseAnonKey, addAutoMoveDiagnostic]
  )

  // Get or create a conversation for an agent role (0070, 0111)
  const getOrCreateConversation = useCallback((agentRole: Agent, conversationId?: string): string => {
    if (conversationId && conversations.has(conversationId)) {
      return conversationId
    }
    // Create new conversation instance
    const instanceNumber = getNextInstanceNumber(conversations, agentRole)
    const newId = getConversationId(agentRole, instanceNumber)
    const newConversation: Conversation = {
      id: newId,
      agentRole,
      instanceNumber,
      messages: [],
      createdAt: new Date(),
    }
    setConversations((prev) => {
      const next = new Map(prev)
      next.set(newId, newConversation)
      return next
    })
    return newId
  }, [conversations])

  // Get default conversation ID for an agent role (for backward compatibility) (0070)
  const getDefaultConversationId = useCallback((agentRole: Agent): string => {
    // Find existing conversation-1, or create it
    const defaultId = getConversationId(agentRole, 1)
    if (conversations.has(defaultId)) {
      return defaultId
    }
    return getOrCreateConversation(agentRole, defaultId)
  }, [conversations, getOrCreateConversation])

  const addMessage = useCallback((conversationId: string, agent: Message['agent'], content: string, id?: number, imageAttachments?: ImageAttachment[], promptText?: string) => {
    const nextId = id ?? ++messageIdRef.current
    if (id != null) messageIdRef.current = Math.max(messageIdRef.current, nextId)
    setConversations((prev) => {
      const next = new Map(prev)
      let conv = next.get(conversationId)
      // Create conversation if it doesn't exist (0124: fix PM chat clearing on refresh)
      if (!conv) {
        const parsed = parseConversationId(conversationId)
        if (parsed) {
          conv = {
            id: conversationId,
            agentRole: parsed.agentRole,
            instanceNumber: parsed.instanceNumber,
            messages: [],
            createdAt: new Date(),
          }
          next.set(conversationId, conv)
        } else {
          // Legacy format: try to parse as agent role only
          const agentRole = conversationId.split('-')[0] as Agent
          if (agentRole === 'project-manager' || agentRole === 'implementation-agent' || agentRole === 'qa-agent' || agentRole === 'process-review-agent') {
            // Convert legacy format to new format (instance 1)
            const newConvId = `${agentRole}-1`
            conv = next.get(newConvId)
            if (!conv) {
              conv = {
                id: newConvId,
                agentRole,
                instanceNumber: 1,
                messages: [],
                createdAt: new Date(),
              }
              next.set(newConvId, conv)
            }
            // Use the new conversation ID for the message
            conversationId = newConvId
          } else {
            // Unknown format, can't create conversation
            return next
          }
        }
      }
      // Deduplication: Check if a message with the same ID already exists (0153: prevent duplicate messages)
      const existingMessageIndex = conv.messages.findIndex(msg => msg.id === nextId)
      if (existingMessageIndex >= 0) {
        // Message with this ID already exists, skip adding duplicate
        return next
      }
      next.set(conversationId, {
        ...conv,
        messages: [...conv.messages, { id: nextId, agent, content, timestamp: new Date(), imageAttachments, ...(promptText && { promptText }) }],
      })
      return next
    })
    // Auto-move ticket when QA completion message is detected in QA Agent chat (0061, 0086)
    const parsed = parseConversationId(conversationId)
    if (parsed && parsed.agentRole === 'qa-agent' && agent === 'qa-agent') {
      const isQaCompletion = /qa.*complete|qa.*report|qa.*pass|qa.*fail|verdict.*pass|verdict.*fail|move.*human.*loop|verified.*main|pass.*ok.*merge/i.test(content)
      if (isQaCompletion) {
        const isPass = /pass|ok.*merge|verified.*main|verdict.*pass/i.test(content) && !/fail|verdict.*fail/i.test(content)
        const isFail = /fail|verdict.*fail|qa.*fail/i.test(content) && !/pass|verdict.*pass/i.test(content)
        
        if (isPass) {
          const currentTicketId = qaAgentTicketId || extractTicketId(content)
          if (currentTicketId) {
            moveTicketToColumn(currentTicketId, 'col-human-in-the-loop', 'qa').catch(() => {
              // Error already logged via addAutoMoveDiagnostic
            })
          } else {
            addAutoMoveDiagnostic(
              `QA Agent completion (PASS): Could not determine ticket ID from message. Auto-move skipped.`,
              'error'
            )
          }
        } else if (isFail) {
          const currentTicketId = qaAgentTicketId || extractTicketId(content)
          if (currentTicketId) {
            moveTicketToColumn(currentTicketId, 'col-todo', 'qa').catch(() => {
              // Error already logged via addAutoMoveDiagnostic
            })
          } else {
            addAutoMoveDiagnostic(
              `QA Agent completion (FAIL): Could not determine ticket ID from message. Auto-move skipped.`,
              'error'
            )
          }
        }
      }
    }
  }, [qaAgentTicketId, extractTicketId, moveTicketToColumn, addAutoMoveDiagnostic])

  // Ensure Process Review Agent conversation exists when chat is opened (0111)
  useEffect(() => {
    if (selectedChatTarget === 'process-review-agent') {
      // Initialize Process Review Agent conversation if it doesn't exist
      getDefaultConversationId('process-review-agent')
    }
  }, [selectedChatTarget, getDefaultConversationId])

  // Add initial welcome/status message to Process Review conversations when they're created (0111)
  useEffect(() => {
    const processReviewConvId = getConversationId('process-review-agent', 1)
    const conv = conversations.get(processReviewConvId)
    if (conv && conv.messages.length === 0) {
      const isAvailable = !!(supabaseUrl && supabaseAnonKey)
      const welcomeMessage = isAvailable
        ? '**Process Review Agent**\n\nI analyze ticket artifacts to suggest improvements to agent instructions and process documentation.\n\nTo run a review, say "Review process for ticket NNNN" (e.g., "Review process for ticket 0046").\n\nI\'m ready to help!'
        : '**Process Review Agent**\n\nI analyze ticket artifacts to suggest improvements to agent instructions and process documentation.\n\n⚠️ **Currently unavailable**: Supabase is not configured. Connect to Supabase to enable Process Review.\n\nOnce Supabase is connected, you can say "Review process for ticket NNNN" to run a review.'
      addMessage(processReviewConvId, 'process-review-agent', welcomeMessage)
    }
  }, [conversations, supabaseUrl, supabaseAnonKey, addMessage])


  // Kanban handlers are now in useKanban hook

  // Agent run handlers via custom hook
  const agentRuns = useAgentRuns({
    supabaseUrl,
    supabaseAnonKey,
    connectedProject,
    connectedGithubRepo,
    conversations,
    agentSequenceRefs,
    pmMaxSequenceRef,
    addMessage,
    getDefaultConversationId,
    setLastAgentError,
    setOpenaiLastError,
    setLastPmOutboundRequest,
    setLastPmToolCalls,
    setAgentTypingTarget,
    setPersistenceError,
    implAgentTicketId,
    qaAgentTicketId,
    setImplAgentTicketId,
    setQaAgentTicketId,
    setImplAgentRunId,
    setQaAgentRunId,
    setImplAgentRunStatus,
    setQaAgentRunStatus,
    setImplAgentProgress,
    setQaAgentProgress,
    setImplAgentError,
    setQaAgentError,
    setCursorRunAgentType,
    setOrphanedCompletionSummary,
    kanbanTickets,
    handleKanbanMoveTicket,
    fetchKanbanData,
  })
  const { triggerAgentRun } = agentRuns

  // Legacy triggerAgentRun function - now provided by useAgentRuns hook
  const _triggerAgentRun = useCallback(
    (content: string, target: ChatTarget, imageAttachments?: ImageAttachment[], conversationId?: string) => {
      // Get or create conversation ID (0070)
      const convId = conversationId || getDefaultConversationId(target === 'project-manager' ? 'project-manager' : target)
      const useDb = target === 'project-manager' && supabaseUrl != null && supabaseAnonKey != null && connectedProject != null
      setLastAgentError(null)

      if (target === 'project-manager') {
        setLastAgentError(null)
        setOpenaiLastError(null)
        setLastPmOutboundRequest(null)
        setLastPmToolCalls(null)
        setAgentTypingTarget('project-manager')
        ;(async () => {
          try {
            // Get Supabase creds from state or env (0119: ensure credentials are available)
            const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
            const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
            // When PM chat is persisted in Supabase, user/assistant messages use integer sequence IDs.
            // System status/progress messages are ephemeral (not persisted) but must NOT collide with
            // the next integer sequence, or the assistant reply will be de-duped and never render.
            let pmSystemMsgCounter = 0
            const addPmSystemMessage = (text: string) => {
              if (useDb && url && key && connectedProject) {
                const baseSeq = agentSequenceRefs.current.get(convId) ?? 0
                pmSystemMsgCounter += 1
                // Use a small fractional offset so IDs remain ordered but never equal an integer sequence.
                const safeId = baseSeq + pmSystemMsgCounter / 100
                addMessage(convId, 'system', text, safeId)
              } else {
                addMessage(convId, 'system', text)
              }
            }
            
            // Add user message to UI (only once, before DB insert to avoid duplicates)
            if (!useDb || !url || !key || !connectedProject) {
              addMessage(convId, 'user', content, undefined, imageAttachments)
            }

            if (useDb && url && key && connectedProject) {
              const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
              const nextSeq = currentMaxSeq + 1
              const supabase = getSupabaseClient(url, key)
              const { error: insertErr } = await supabase.from('hal_conversation_messages').insert({
                project_id: connectedProject,
                agent: convId, // Use conversation ID (e.g., "project-manager-1") (0124)
                role: 'user',
                content,
                sequence: nextSeq,
                ...(imageAttachments && imageAttachments.length > 0
                  ? {
                      images: imageAttachments.map((img) => ({
                        dataUrl: img.dataUrl,
                        filename: img.filename,
                        mimeType: img.file.type,
                      })),
                    }
                  : {}),
              })
              if (insertErr) {
                setPersistenceError(`DB: ${insertErr.message}`)
                // Message already added above if useDb was false, so only add if useDb was true
                if (useDb) {
                  addMessage(convId, 'user', content, undefined, imageAttachments)
                }
              } else {
                agentSequenceRefs.current.set(convId, nextSeq)
                // Backward compatibility: update pmMaxSequenceRef for PM conversations
                const parsed = parseConversationId(convId)
                if (parsed && parsed.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                  pmMaxSequenceRef.current = nextSeq
                }
                // Message already added above if useDb was false, so only add if useDb was true
                if (useDb) {
                  addMessage(convId, 'user', content, nextSeq, imageAttachments)
                }
              }
            }

            if (!connectedGithubRepo?.fullName) {
              setAgentTypingTarget(null)
              addMessage(convId, 'project-manager', '[PM] Connect a GitHub repo first (Connect GitHub Repo) so the PM agent can use the codebase.')
              return
            }

            addPmSystemMessage('[Status] Launching PM agent (Cursor)...')
            const launchRes = await fetch('/api/pm-agent/launch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                message: content,
                repoFullName: connectedGithubRepo.fullName,
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const launchData = (await launchRes.json()) as { runId?: string; status?: string; error?: string }
            if (!launchData.runId || launchData.status === 'failed') {
              setAgentTypingTarget(null)
              const errMsg = launchData.error ?? 'Launch failed'
              setOpenaiLastError(errMsg)
              setLastAgentError(errMsg)
              addMessage(convId, 'project-manager', `[PM] Error: ${errMsg}`)
              return
            }

            const runId = launchData.runId
            addPmSystemMessage('[Progress] PM agent running. Polling status...')
            const poll = async (): Promise<{ done: boolean; reply?: string; error?: string }> => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
              const data = await r.json() as { status?: string; summary?: string; error?: string }
              const s = String(data.status ?? '')
              if (s === 'failed') return { done: true, error: data.error ?? 'Unknown error' }
              if (s === 'finished') return { done: true, reply: data.summary ?? 'Done.' }
              return { done: false }
            }
            for (;;) {
              const result = await poll()
              if (!result.done) {
                await new Promise((r) => setTimeout(r, 4000))
                continue
              }
              setAgentTypingTarget(null)
              setOpenaiLastError(null)
              setLastAgentError(null)
              const reply = result.error ? `[PM] Error: ${result.error}` : (result.reply ?? '')
              if (useDb && url && key && connectedProject) {
                const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
                const nextSeq = currentMaxSeq + 1
                const supabase = getSupabaseClient(url, key)
                await supabase.from('hal_conversation_messages').insert({
                  project_id: connectedProject,
                  agent: convId,
                  role: 'assistant',
                  content: reply,
                  sequence: nextSeq,
                })
                agentSequenceRefs.current.set(convId, nextSeq)
                const parsed = parseConversationId(convId)
                if (parsed?.agentRole === 'project-manager' && parsed.instanceNumber === 1) pmMaxSequenceRef.current = nextSeq
                addMessage(convId, 'project-manager', reply, nextSeq)
              } else {
                addMessage(convId, 'project-manager', reply)
              }
              break
            }
          } catch (err) {
            setAgentTypingTarget(null)
            const msg = err instanceof Error ? err.message : String(err)
            setOpenaiLastStatus(null)
            setOpenaiLastError(msg)
            setLastAgentError(msg)
            addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
          }
        })()
      } else if (target === 'implementation-agent') {
        const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
        if (!cursorApiConfigured) {
          addMessage(
            convId,
            'implementation-agent',
            '[Implementation Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
          )
          return
        }

        const ticketId = extractTicketId(content)
        if (ticketId) setImplAgentTicketId(ticketId)

        // Show run start status with ticket ID
        if (ticketId) {
          addMessage(convId, 'system', `[Status] Starting Implementation run for ticket ${ticketId}...`)
        }

        setAgentTypingTarget('implementation-agent')
        setImplAgentRunStatus('preparing')
        setImplAgentProgress([])
        setImplAgentError(null)
        // Track which agent initiated this run (0067)
        setCursorRunAgentType('implementation-agent')
        setOrphanedCompletionSummary(null)

        ;(async () => {
          const addProgress = (message: string) => {
            const progressEntry = { timestamp: new Date(), message }
            setImplAgentProgress((prev) => [...prev, progressEntry])
            addMessage(convId, 'system', `[Progress] ${message}`)
          }

          try {
            if (!ticketId) {
              setImplAgentRunStatus('failed')
              const msg = 'Say "Implement ticket NNNN" (e.g. Implement ticket 0046).'
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!connectedGithubRepo?.fullName) {
              setImplAgentRunStatus('failed')
              const msg = 'No GitHub repo connected. Use "Connect GitHub Repo" first.'
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setImplAgentRunStatus('launching')
            addProgress('Launching cloud agent (async run)...')

            const launchRes = await fetch('/api/agent-runs/launch', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'implementation',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const implLaunchText = await launchRes.text()
            let launchData: { runId?: string; status?: string; error?: string }
            try {
              launchData = JSON.parse(implLaunchText) as typeof launchData
            } catch {
              const msg = launchRes.ok
                ? 'Invalid response from server (not JSON).'
                : `Launch failed (${launchRes.status}): ${implLaunchText.slice(0, 200)}`
              setImplAgentRunStatus('failed')
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!launchRes.ok || !launchData.runId) {
              const msg = launchData.error ?? `Launch failed (HTTP ${launchRes.status})`
              setImplAgentRunStatus('failed')
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setImplAgentRunId(launchData.runId)
            setImplAgentRunStatus('polling')
            addProgress(`Run launched. Polling status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const poll = async () => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`, {
                credentials: 'include',
              })
              const implStatusText = await r.text()
              let data: { status?: string; current_stage?: string; cursor_status?: string; error?: string; summary?: string; pr_url?: string }
              try {
                data = JSON.parse(implStatusText) as typeof data
              } catch {
                const msg = r.ok
                  ? 'Invalid response when polling status (not JSON).'
                  : `Status check failed (${r.status}): ${implStatusText.slice(0, 200)}`
                setImplAgentRunStatus('failed')
                setImplAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              const s = String(data.status ?? '')
              const currentStage = String(data.current_stage ?? '')
              const cursorStatus = String(data.cursor_status ?? '')
              
              // Map current_stage to implAgentRunStatus (0690)
              if (currentStage && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'running', 'completed', 'failed'].includes(currentStage)) {
                setImplAgentRunStatus(currentStage as typeof implAgentRunStatus)
              } else if (s === 'polling' && !currentStage) {
                // Fallback: if no current_stage but status is polling, use 'running'
                setImplAgentRunStatus('running')
              }
              
              if (s === 'failed') {
                setImplAgentRunStatus('failed')
                const msg = String(data.error ?? 'Unknown error')
                setImplAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              if (s === 'finished') {
                setImplAgentRunStatus('completed')
                const summary = String(data.summary ?? 'Implementation completed.')
                const prUrl = data.pr_url ? String(data.pr_url) : ''
                const full = prUrl ? `${summary}\n\nPull request: ${prUrl}` : summary
                addProgress('Implementation completed successfully.')
                addMessage(convId, 'implementation-agent', `**Completion summary**\n\n${full}`)
                setImplAgentRunId(null)
                const ticketIdForMove = implAgentTicketId
                let ticketPkForSync: string | null = null
                if (ticketIdForMove) {
                  const ticket = kanbanTickets.find(
                    (t) =>
                      (t.display_id ?? String(t.ticket_number ?? t.id).padStart(4, '0')) === ticketIdForMove ||
                      t.pk === ticketIdForMove
                  )
                  if (ticket) ticketPkForSync = ticket.pk
                  if (ticket?.kanban_column_id === 'col-doing') {
                    const qaCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-qa').length
                    handleKanbanMoveTicket(ticket.pk, 'col-qa', qaCount).catch(() => {})
                  }
                }
                setImplAgentTicketId(null)
                setCursorRunAgentType(null)
                setAgentTypingTarget(null)
                // Backfill artifacts from run (in case poll path didn't write) then refresh board
                if (ticketPkForSync) {
                  fetch('/api/agent-runs/sync-artifacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ticketPk: ticketPkForSync }),
                  }).catch(() => {}).finally(() => fetchKanbanData().catch(() => {}))
                } else {
                  fetchKanbanData().catch(() => {})
                }
                return false
              }
              if (cursorStatus) addProgress(`Agent is running (status: ${cursorStatus})...`)
              return true
            }

            // Poll loop (client-side) until terminal state
            for (;;) {
              const keep = await poll()
              if (!keep) break
              await new Promise((r) => setTimeout(r, 4000))
            }
          } catch (err) {
            setImplAgentRunStatus('failed')
            const msg = err instanceof Error ? err.message : String(err)
            setImplAgentError(msg)
            addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
            setTimeout(() => setAgentTypingTarget(null), 500)
          }
        })()
      } else if (target === 'qa-agent') {
        const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
        if (!cursorApiConfigured) {
          addMessage(
            convId,
            'qa-agent',
            '[QA Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
          )
          return
        }

        const ticketId = extractTicketId(content)
        if (ticketId) setQaAgentTicketId(ticketId)

        // Show run start status with ticket ID
        if (ticketId) {
          addMessage(convId, 'system', `[Status] Starting QA run for ticket ${ticketId}...`)
        }

        setAgentTypingTarget('qa-agent')
        setQaAgentRunStatus('preparing')
        setQaAgentProgress([])
        setQaAgentError(null)
        // Track which agent initiated this run (0067)
        setCursorRunAgentType('qa-agent')
        setOrphanedCompletionSummary(null)

        ;(async () => {
          const addProgress = (message: string) => {
            const progressEntry = { timestamp: new Date(), message }
            setQaAgentProgress((prev) => [...prev, progressEntry])
            addMessage(convId, 'system', `[Progress] ${message}`)
          }

          try {
            if (!ticketId) {
              setQaAgentRunStatus('failed')
              const msg = 'Say "QA ticket NNNN" (e.g. QA ticket 0046).'
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!connectedGithubRepo?.fullName) {
              setQaAgentRunStatus('failed')
              const msg = 'No GitHub repo connected. Use "Connect GitHub Repo" first.'
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setQaAgentRunStatus('launching')
            addProgress('Launching QA agent (async run)...')

            const launchRes = await fetch('/api/agent-runs/launch', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'qa',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const launchText = await launchRes.text()
            let launchData: { runId?: string; status?: string; error?: string }
            try {
              launchData = JSON.parse(launchText) as typeof launchData
            } catch {
              const msg = launchRes.ok
                ? 'Invalid response from server (not JSON).'
                : `Launch failed (${launchRes.status}): ${launchText.slice(0, 200)}`
              setQaAgentRunStatus('failed')
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!launchRes.ok || !launchData.runId) {
              const msg = launchData.error ?? `Launch failed (HTTP ${launchRes.status})`
              setQaAgentRunStatus('failed')
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setQaAgentRunId(launchData.runId)
            setQaAgentRunStatus('polling')
            addProgress(`Run launched. Polling status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const poll = async () => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`, {
                credentials: 'include',
              })
              const text = await r.text()
              let data: { status?: string; current_stage?: string; cursor_status?: string; error?: string; summary?: string }
              try {
                data = JSON.parse(text) as typeof data
              } catch {
                const msg = r.ok
                  ? 'Invalid response when polling status (not JSON).'
                  : `Status check failed (${r.status}): ${text.slice(0, 200)}`
                setQaAgentRunStatus('failed')
                setQaAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              const s = String(data.status ?? '')
              const currentStage = String(data.current_stage ?? '')
              const cursorStatus = String(data.cursor_status ?? '')
              
              // Map current_stage to qaAgentRunStatus (0690)
              if (currentStage && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'reviewing', 'completed', 'failed'].includes(currentStage)) {
                setQaAgentRunStatus(currentStage as typeof qaAgentRunStatus)
              } else if (s === 'polling' && !currentStage) {
                // Fallback: if no current_stage but status is polling, use 'reviewing'
                setQaAgentRunStatus('reviewing')
              }
              
              if (s === 'failed') {
                setQaAgentRunStatus('failed')
                const msg = String(data.error ?? 'Unknown error')
                setQaAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              if (s === 'finished') {
                setQaAgentRunStatus('completed')
                const summary = String(data.summary ?? 'QA completed.')
                addProgress('QA completed successfully.')
                addMessage(convId, 'qa-agent', `**Completion summary**\n\n${summary}`)
                setQaAgentRunId(null)
                setQaAgentTicketId(null)
                setCursorRunAgentType(null)
                setAgentTypingTarget(null)
                return false
              }
              if (cursorStatus) addProgress(`QA agent is running (status: ${cursorStatus})...`)
              return true
            }

            for (;;) {
              const keep = await poll()
              if (!keep) break
              await new Promise((r) => setTimeout(r, 4000))
            }
          } catch (err) {
            setQaAgentRunStatus('failed')
            const msg = err instanceof Error ? err.message : String(err)
            setQaAgentError(msg)
            addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
            setTimeout(() => setAgentTypingTarget(null), 500)
          }
        })()
      }
    },
    [
      supabaseUrl,
      supabaseAnonKey,
      connectedProject,
      conversations,
      addMessage,
      extractTicketId,
      moveTicketToColumn,
      implAgentTicketId,
      qaAgentTicketId,
      setImplAgentTicketId,
      setQaAgentTicketId,
      addAutoMoveDiagnostic,
      cursorRunAgentType,
      setCursorRunAgentType,
      setOrphanedCompletionSummary,
      getDefaultConversationId,
      kanbanTickets,
      handleKanbanMoveTicket,
      fetchKanbanData,
    ]
  )
  // triggerAgentRun is now provided by useAgentRuns hook

  // Track most recent work button click event for diagnostics (0072) - no longer displayed with floating widget (0698)
  const [_lastWorkButtonClick, setLastWorkButtonClick] = useState<{ eventId: string; timestamp: Date; chatTarget: ChatTarget; message: string } | null>(null)

  /** Kanban work button: trigger correct Cursor agent run (HAL-0700). */
  const handleKanbanOpenChatAndSend = useCallback(
    async (data: { chatTarget: ChatTarget; message: string; ticketPk?: string }) => {
      if (!data.message) return
      const eventId = `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setLastWorkButtonClick({
        eventId,
        timestamp: new Date(),
        chatTarget: data.chatTarget,
        message: data.message,
      })

      // Route work button action; PM opens PM widget, non-PM never touches PM widget/history (HAL-0700)
      await routeKanbanWorkButtonClick(data as KanbanWorkButtonPayload, {
        pmChatWidgetOpen,
        openPmChatWidget: () => setPmChatWidgetOpen(true),
        setSelectedChatTarget: () => setSelectedChatTarget('project-manager'),
        setSelectedConversationId,
        getDefaultPmConversationId: () => getDefaultConversationId('project-manager'),
        triggerAgentRun: (content, target, conversationId) =>
          triggerAgentRun(content, target, undefined, conversationId),
        moveTicketToDoingIfNeeded: async ({ ticketPk, chatTarget }) => {
          if (chatTarget !== 'implementation-agent' && chatTarget !== 'qa-agent') return
          const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
          await handleKanbanMoveTicket(ticketPk, 'col-doing', doingCount)
        },
      })
    },
    [
      triggerAgentRun,
      getDefaultConversationId,
      kanbanTickets,
      handleKanbanMoveTicket,
      pmChatWidgetOpen,
      setSelectedConversationId,
      setSelectedChatTarget,
    ]
  )

  /** Process Review button: trigger Process Review agent for top ticket in Process Review column. */
  const handleKanbanProcessReview = useCallback(
    async (data: { ticketPk: string; ticketId?: string }) => {
      if (!data.ticketPk) return
      
      // Get or create Process Review conversation
      const convId = getOrCreateConversation('process-review-agent')
      // Keep Process Review flow internal; do not switch PM chat UI context (HAL-0700)
      
      // Move ticket to Active Work (col-doing) when Process Review starts (0167)
      const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
      try {
        await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
      } catch (moveError) {
        console.error('Failed to move ticket to Active Work:', moveError)
        // Continue with Process Review even if move fails
      }
      
      // Set status to running (for chat UI only; no banner)
      setProcessReviewStatus('running')
      setProcessReviewTicketPk(data.ticketPk)
      setProcessReviewAgentRunStatus('preparing')
      setProcessReviewAgentTicketId(data.ticketId || null) // Track ticket ID for future use
      setProcessReviewAgentProgress([])
      setProcessReviewAgentError(null)

      // Post start message to chat
      const ticketDisplayId = data.ticketId ? formatTicketId(data.ticketId) : data.ticketPk
      addMessage(convId, 'process-review-agent', `[Process Review] Starting review for ticket ${ticketDisplayId}...`)
      const addProgress = (message: string) => {
        const progressEntry = { timestamp: new Date(), message }
        setProcessReviewAgentProgress((prev) => [...prev, progressEntry])
        addMessage(convId, 'process-review-agent', `[Progress] ${message}`)
      }
      addProgress('Launching Process Review agent (Cursor)...')
      setProcessReviewAgentRunStatus('running')

      try {
        const launchRes = await fetch('/api/process-review/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk: data.ticketPk,
            ticketId: data.ticketId,
            supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? undefined,
            supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? undefined,
          }),
        })
        const launchData = (await launchRes.json()) as { success?: boolean; runId?: string; status?: string; error?: string }
        if (!launchData.success || !launchData.runId || launchData.status === 'failed') {
          setProcessReviewStatus('failed')
          setProcessReviewAgentRunStatus('failed')
          const errorMsg = launchData.error || 'Launch failed'
          setProcessReviewAgentError(errorMsg)
          addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
          return
        }

        addProgress('Process Review agent running. Polling status...')
        let reviewId: string | null = null
        const runId = launchData.runId
        // Use the agent runId as a stable Process Review ID for idempotency and tracking.
        // This ensures tickets are only created when the user clicks "Implement" in the modal.
        reviewId = runId
        let lastStatus: string
        let suggestions: Array<{ text: string; justification: string }> = []
        for (;;) {
          await new Promise((r) => setTimeout(r, 4000))
          const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
          const pollData = (await r.json()) as { status?: string; error?: string; suggestions?: Array<{ text: string; justification: string }> }
          lastStatus = String(pollData.status ?? '')
          if (pollData.suggestions) suggestions = pollData.suggestions
          if (lastStatus === 'failed') {
            setProcessReviewStatus('failed')
            setProcessReviewAgentRunStatus('failed')
            const errorMsg = pollData.error || 'Unknown error'
            setProcessReviewAgentError(errorMsg)
            addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
            return
          }
          if (lastStatus === 'finished') break
        }

        const suggestionCount = suggestions?.length || 0
        if (suggestionCount > 0 && suggestions) {
          const recommendations = suggestions.map((s: { text: string; justification: string }, idx: number) => ({
            text: s.text,
            justification: s.justification,
            id: `rec-${Date.now()}-${idx}`,
            error: undefined as string | undefined,
            isCreating: false,
          }))
          setProcessReviewRecommendations(recommendations)
          setProcessReviewModalTicketPk(data.ticketPk)
          setProcessReviewModalTicketId(data.ticketId || null)
          setProcessReviewModalReviewId(reviewId)

          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. ${suggestionCount} recommendation${suggestionCount !== 1 ? 's' : ''} ready for review.`
          addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}\n\nReview the recommendations in the modal and click "Implement" to create tickets.`)

          // Modal auto-opens when recommendations are set (no banner, ticket stays in Active Work)
          addProgress('Process Review completed - recommendations modal opened')
        } else {
          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. No recommendations found.`
          addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}`)

          // Ticket stays in Active Work (no move to Done, no banner)
          addProgress('Process Review completed - no recommendations found')
          setTimeout(() => {
            setProcessReviewStatus('idle')
            setProcessReviewTicketPk(null)
          }, 5000)
        }
      } catch (err) {
        setProcessReviewStatus('failed')
        setProcessReviewAgentRunStatus('failed')
        const errorMsg = err instanceof Error ? err.message : String(err)
        setProcessReviewAgentError(errorMsg)
        addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
      }
    },
    [supabaseUrl, supabaseAnonKey, getOrCreateConversation, formatTicketId, addMessage, kanbanTickets, handleKanbanMoveTicket]
  )

  /** Handle Implement button click for Process Review recommendation (0484). */
  const handleProcessReviewImplement = useCallback(
    async (recommendationId: string) => {
      if (!processReviewRecommendations || !processReviewModalTicketPk || !processReviewModalReviewId) return

      const recommendation = processReviewRecommendations.find((r) => r.id === recommendationId)
      if (!recommendation) return

      // Set loading state
      setProcessReviewRecommendations((prev) =>
        prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: true, error: undefined } : r)) : null
      )

      try {
        // Helper function to hash suggestion text for idempotency
        const hashSuggestion = async (text: string): Promise<string> => {
          const encoder = new TextEncoder()
          const data = encoder.encode(text)
          const hashBuffer = await crypto.subtle.digest('SHA-256', data)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          const fullHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
          return fullHash.slice(0, 16)
        }

        const suggestionHash = await hashSuggestion(recommendation.text)

        const createResponse = await fetch('/api/tickets/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceTicketPk: processReviewModalTicketPk,
            sourceTicketId: processReviewModalTicketId,
            suggestion: recommendation.text,
            reviewId: processReviewModalReviewId,
            suggestionHash: suggestionHash,
            supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? undefined,
            supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? undefined,
          }),
        })

        const createResult = await createResponse.json()

        if (createResult.success) {
          // Remove recommendation from modal on success and check if all are processed
          setProcessReviewRecommendations((prev) => {
            const remaining = prev?.filter((r) => r.id !== recommendationId) || null
            
            // If all recommendations are processed, close modal and move ticket to Done
            if (!remaining || remaining.length === 0) {
              // Move ticket to Done asynchronously
              const doneCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-done').length
              handleKanbanMoveTicket(processReviewModalTicketPk, 'col-done', doneCount).catch((moveError) => {
                console.error('Failed to move ticket to Done:', moveError)
              })
              // Close modal
              setProcessReviewModalTicketPk(null)
              setProcessReviewModalTicketId(null)
              setProcessReviewModalReviewId(null)
              return null
            }
            
            return remaining
          })
        } else {
          // Show error state for this recommendation
          const errorMsg = createResult.error || 'Unknown error'
          setProcessReviewRecommendations((prev) =>
            prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: false, error: errorMsg } : r)) : null
          )
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setProcessReviewRecommendations((prev) =>
          prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: false, error: errorMsg } : r)) : null
        )
      }
    },
    [processReviewRecommendations, processReviewModalTicketPk, processReviewModalTicketId, processReviewModalReviewId, supabaseUrl, supabaseAnonKey, kanbanTickets, handleKanbanMoveTicket]
  )

  /** Handle Ignore button click for Process Review recommendation (0484). */
  const handleProcessReviewIgnore = useCallback(
    (recommendationId: string) => {
      setProcessReviewRecommendations((prev) => {
        const remaining = prev?.filter((r) => r.id !== recommendationId) || null
        
        // If all recommendations are processed, close modal
        if (!remaining || remaining.length === 0) {
          setProcessReviewModalTicketPk(null)
          setProcessReviewModalTicketId(null)
          setProcessReviewModalReviewId(null)
          return null
        }
        
        return remaining
      })
    },
    []
  )

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageError(null)

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setImageError(`Unsupported file type: ${file.type}. Please select a JPEG, PNG, GIF, or WebP image.`)
      e.target.value = '' // Reset input
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      setImageError(`File is too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 10MB.`)
      e.target.value = '' // Reset input
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setImageAttachment({
        file,
        dataUrl,
        filename: file.name,
      })
    }
    reader.onerror = () => {
      setImageError('Failed to read image file.')
      e.target.value = '' // Reset input
    }
    reader.readAsDataURL(file)
  }, [])

  const handleRemoveImage = useCallback(() => {
    setImageAttachment(null)
    setImageError(null)
  }, [])

  const handleSendForTarget = useCallback(
    (target: ChatTarget, conversationIdOverride?: string | null) => {
      const content = inputValue.trim()

      // Clear previous validation error
      setSendValidationError(null)

      // Validate: must have either text or image
      if (!content && !imageAttachment) {
        setSendValidationError(
          'Please enter a message or attach an image before sending.'
        )
        return
      }

      // Don't send if there's an image error
      if (imageError) {
        setSendValidationError('Please fix the image error before sending.')
        return
      }

      // Get or create conversation ID for the provided chat target (0070)
      let convId: string
      if (conversationIdOverride && conversations.has(conversationIdOverride)) {
        convId = conversationIdOverride
      } else {
        convId = getDefaultConversationId(
          target === 'project-manager' ? 'project-manager' : target
        )
      }

      const attachments = imageAttachment ? [imageAttachment] : undefined

      // Track payload summary for diagnostics (0077)
      const hasText = content.length > 0
      const hasImages = attachments && attachments.length > 0
      let payloadSummary: string
      if (hasText && hasImages) {
        payloadSummary = `Text + ${attachments.length} image${attachments.length > 1 ? 's' : ''}`
      } else if (hasText) {
        payloadSummary = 'Text only'
      } else if (hasImages) {
        payloadSummary = `${attachments.length} image${attachments.length > 1 ? 's' : ''} only`
      } else {
        payloadSummary = 'Empty (should not happen)'
      }
      setLastSendPayloadSummary(payloadSummary)

      // Don't add message here for PM agent - triggerAgentRun will handle it (0153: prevent duplicates)
      // For non-PM agents, triggerAgentRun doesn't add user messages, so we add it here
      if (target !== 'project-manager') {
        addMessage(convId, 'user', content, undefined, attachments)
      }
      setInputValue('')
      setImageAttachment(null)
      setImageError(null)
      setSendValidationError(null)
      setLastAgentError(null)

      // Use the extracted triggerAgentRun function
      triggerAgentRun(content, target, attachments, convId)
    },
    [
      inputValue,
      imageAttachment,
      imageError,
      conversations,
      addMessage,
      triggerAgentRun,
      getDefaultConversationId,
    ]
  )

  /** Send "Continue" to PM for multi-batch bulk operations (e.g. move all tickets). */
  const handleContinueBatch = useCallback(() => {
    const convId = getDefaultConversationId('project-manager')
    triggerAgentRun('Continue', 'project-manager', undefined, convId)
  }, [getDefaultConversationId, triggerAgentRun])



  const handleDisconnect = useCallback(() => {
    setKanbanTickets([])
    setKanbanColumns([])
    setKanbanAgentRunsByTicketPk({})
    setLastError(null)
    // Clear conversations from state (UI will show placeholder), but keep in localStorage for reconnect (0097)
    setConversations(getEmptyConversations())
    messageIdRef.current = 0
    pmMaxSequenceRef.current = 0
    setPersistenceError(null)
    setConnectedProject(null)
    setConnectedGithubRepo(null)
    setLastTicketCreationResult(null)
    setLastCreateTicketAvailable(null)
    setSupabaseUrl(null)
    setSupabaseAnonKey(null)
    setUnreadByTarget({ 'project-manager': 0, 'implementation-agent': 0, 'qa-agent': 0, 'process-review-agent': 0 })
    // Do NOT clear agent status on disconnect (0097: preserve agent status across disconnect/reconnect)
    // Only clear ticket IDs and diagnostics (these are per-session)
    setImplAgentTicketId(null)
    setQaAgentTicketId(null)
    setAutoMoveDiagnostics([])
    setCursorRunAgentType(null)
    setOrphanedCompletionSummary(null)
    _setPmWorkingMemoryOpen(false)
    // Do NOT remove localStorage items on disconnect (0097: preserve chats and agent status across disconnect/reconnect)
    // They will be restored when reconnecting to the same repo
  }, [])

  const handleDisconnectClick = useCallback(() => {
    setDisconnectConfirmOpen(true)
  }, [])

  const handleDisconnectConfirm = useCallback(() => {
    setDisconnectConfirmOpen(false)
    handleDisconnect()
    // After disconnect, the Disconnect button will be replaced by Connect button, so no focus return needed
  }, [handleDisconnect])

  const handleDisconnectCancel = useCallback(() => {
    setDisconnectConfirmOpen(false)
    // Return focus to the Disconnect button
    setTimeout(() => {
      disconnectButtonRef.current?.focus()
    }, 0)
  }, [])

  // Handle Esc key and focus management for disconnect confirmation modal (0142)
  useEffect(() => {
    if (!disconnectConfirmOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDisconnectCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Focus the confirm button when modal opens
    setTimeout(() => {
      disconnectConfirmButtonRef.current?.focus()
    }, 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [disconnectConfirmOpen, handleDisconnectCancel])


  // Determine theme source - no longer displayed with floating widget (0698)
  // const _themeSource: 'default' | 'saved' = (() => {
  //   try {
  //     const stored = localStorage.getItem(THEME_STORAGE_KEY)
  //     return stored === 'light' || stored === 'dark' ? 'saved' : 'default'
  //   } catch {
  //     return 'default'
  //   }
  // })()

  // Diagnostics info - removed, no longer displayed with floating widget (0698)

  // Derive sync status from realtime connection status (0737)
  const kanbanSyncStatus: 'realtime' | 'polling' = kanbanRealtimeStatus === 'connected' ? 'realtime' : 'polling'

  const kanbanBoardProps: KanbanBoardProps = {
    tickets: kanbanTickets,
    columns: kanbanColumns,
    agentRunsByTicketPk: kanbanAgentRunsByTicketPk,
    repoFullName: connectedProject ?? null,
    theme,
    onMoveTicket: handleKanbanMoveTicket,
    onReorderColumn: handleKanbanReorderColumn,
    onUpdateTicketBody: handleKanbanUpdateTicketBody,
    onOpenChatAndSend: handleKanbanOpenChatAndSend,
    onProcessReview: handleKanbanProcessReview,
    processReviewRunningForTicketPk: processReviewStatus === 'running' ? processReviewTicketPk : null,
    implementationAgentTicketId: implAgentTicketId,
    qaAgentTicketId: qaAgentTicketId,
    fetchArtifactsForTicket,
    supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
    supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null,
    onTicketCreated: fetchKanbanData,
    syncStatus: kanbanSyncStatus,
    lastSync: kanbanLastSync,
  }

  // Chat panel content is now in PmChatWidget component
  const lastPmMsg = pmMessages[pmMessages.length - 1]
  const showContinueButton =
    agentTypingTarget !== 'project-manager' &&
    !!lastPmMsg &&
    lastPmMsg.agent === 'project-manager' &&
    lastPmMsg.content.includes('Reply with **Continue** to move the next batch')

  return (
    <div className="hal-app">
      <header className="hal-header">
        <div className="hal-header-left">
          <h1>HAL</h1>
          <span className="hal-subtitle">Agent Workspace</span>
        </div>
        <div className="hal-header-center">
          {!connectedProject ? (
            <button type="button" className="connect-project-btn btn-standard" onClick={handleGithubConnect}>
              Connect GitHub Repo
            </button>
          ) : (
            <>
              {connectedGithubRepo && (
                <>
                  {/* Coverage badge on the left (0699) */}
                  <CoverageBadge onClick={() => setCoverageReportOpen(true)} />
                  {/* Repo/Disconnect box in the middle (0708: GitHub row on top, both rows use same layout) */}
                  <div className="project-info">
                    {/* GitHub connection row (0708: on top, same layout as repo row) */}
                    <div className="project-info-row">
                      <span className="project-name">
                        {githubAuth?.authenticated ? `GitHub: ${githubAuth.login ?? 'connected'}` : 'GitHub: Not signed in'}
                      </span>
                      <button
                        type="button"
                        className={`disconnect-btn ${githubAuth?.authenticated ? 'btn-destructive' : 'btn-standard'}`}
                        onClick={githubAuth?.authenticated ? handleGithubDisconnect : handleGithubConnect}
                        title={githubAuth?.authenticated ? 'Sign out of GitHub' : 'Sign in with GitHub'}
                      >
                        {githubAuth?.authenticated ? 'Sign out' : 'Sign in'}
                      </button>
                    </div>
                    {/* Repo connection row (0708: below GitHub row, functionally unchanged) */}
                    <div className="project-info-row">
                      <span className="project-name" title={connectedGithubRepo.fullName}>
                        Repo: {connectedGithubRepo.fullName.split('/').pop() || connectedGithubRepo.fullName}
                      </span>
                      <button
                        ref={disconnectButtonRef}
                        type="button"
                        className="disconnect-btn btn-destructive"
                        onClick={handleDisconnectClick}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                  {/* Simplicity badge on the right (0699) */}
                  <SimplicityBadge onClick={() => setSimplicityReportOpen(true)} />
                </>
              )}
            </>
          )}
        </div>
        <div className="hal-header-actions">
          <button
            type="button"
            className="agent-instructions-btn btn-standard"
            onClick={() => setAgentInstructionsOpen(true)}
            aria-label="View agent instructions"
            title="View agent instructions"
          >
            Agent Instructions
          </button>
        </div>
      </header>

      {githubConnectError && (
        <div className="connect-error" role="alert">
          {githubConnectError}
        </div>
      )}

      {githubRepoPickerOpen && (
        <div className="conversation-modal-overlay" onClick={() => setGithubRepoPickerOpen(false)}>
          <div className="conversation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="conversation-modal-header">
              <h3>Select GitHub repository</h3>
              <button type="button" className="conversation-modal-close btn-destructive" onClick={() => setGithubRepoPickerOpen(false)} aria-label="Close repo picker">
                ×
              </button>
            </div>
            <div className="conversation-modal-content">
              <div style={{ padding: '12px' }}>
                <input
                  type="text"
                  value={githubRepoQuery}
                  onChange={(e) => setGithubRepoQuery(e.target.value)}
                  placeholder="Filter repos (owner/name)"
                  style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
                />
                {!githubRepos ? (
                  <div>Loading repos…</div>
                ) : githubRepos.length === 0 ? (
                  <div>No repos found.</div>
                ) : (
                  <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                    {githubRepos
                      .filter((r) => r.full_name.toLowerCase().includes(githubRepoQuery.trim().toLowerCase()))
                      .slice(0, 200)
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectGithubRepo(r)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px',
                            marginBottom: '8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(0,0,0,0.15)',
                            background: 'transparent',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                          <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                            {r.private ? 'Private' : 'Public'} • default: {r.default_branch}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {disconnectConfirmOpen && (
        <div className="conversation-modal-overlay" onClick={handleDisconnectCancel}>
          <div className="conversation-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="disconnect-confirm-title" aria-modal="true">
            <div className="conversation-modal-header">
              <h3 id="disconnect-confirm-title">Disconnect this repository?</h3>
              <button type="button" className="conversation-modal-close btn-destructive" onClick={handleDisconnectCancel} aria-label="Close confirmation">
                ×
              </button>
            </div>
            <div className="conversation-modal-content">
              <div style={{ padding: '1.25rem' }}>
                <p style={{ margin: '0 0 1.5rem 0', color: 'var(--hal-text)' }}>
                  Are you sure you want to disconnect from this repository? You can reconnect later.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={handleDisconnectCancel}
                  >
                    Cancel
                  </button>
                  <button
                    ref={disconnectConfirmButtonRef}
                    type="button"
                    className="btn-destructive"
                    onClick={handleDisconnectConfirm}
                  >
                    Yes, disconnect
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="hal-main">
        {/* Left column: Kanban board */}
        <section className="hal-kanban-region" aria-label="Kanban board">
          {githubConnectError && (
            <div className="connect-error" role="alert">
              {githubConnectError}
            </div>
          )}
          {lastError && (
            <div className="connect-error" role="alert">
              {lastError}
            </div>
          )}
          {/* Kanban board (HAL owns data; passes tickets/columns and callbacks). Cast props so fetchArtifactsForTicket is accepted when package types are older (e.g. Vercel cache). */}
          <div className="kanban-frame-container">
            {/* Ticket move error message (0155) */}
            {kanbanMoveError && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  right: connectedProject ? '120px' : '8px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  zIndex: 1001,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <span>{kanbanMoveError}</span>
                <button
                  onClick={() => setKanbanMoveError(null)}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '18px',
                    lineHeight: '1',
                    padding: '0',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            <KanbanBoard {...kanbanBoardProps} />
          </div>
        </section>

        {/* Floating PM Chat Widget (0698) */}
        {connectedProject && (
          <>
            {!pmChatWidgetOpen && (
              <button
                type="button"
                className="pm-chat-widget-button btn-standard"
                onClick={() => {
                  setPmChatWidgetOpen(true)
                  setSelectedChatTarget('project-manager')
                  setSelectedConversationId(null)
                }}
                aria-label="Open PM chat"
                title="Open PM chat"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            )}
            {pmChatWidgetOpen && (
              <PmChatWidget
                isOpen={pmChatWidgetOpen}
                isFullscreen={pmChatWidgetFullscreen}
                onToggleFullscreen={() => setPmChatWidgetFullscreen(!pmChatWidgetFullscreen)}
                onClose={() => {
                  setPmChatWidgetOpen(false)
                  setPmChatWidgetFullscreen(false)
                }}
                displayMessages={pmMessages}
                displayTarget="project-manager"
                agentTypingTarget={agentTypingTarget}
                imageAttachment={imageAttachment}
                imageError={imageError}
                sendValidationError={sendValidationError}
                inputValue={inputValue}
                implAgentRunStatus={implAgentRunStatus}
                implAgentError={implAgentError}
                onInputChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendForTarget('project-manager', null)
                  }
                }}
                onSend={() => handleSendForTarget('project-manager', null)}
                onImageSelect={handleImageSelect}
                onRemoveImage={handleRemoveImage}
                onContinueBatch={showContinueButton ? handleContinueBatch : undefined}
                showContinueButton={showContinueButton}
                onMessageClick={(msg) => setPromptModalMessage(msg)}
                messagesEndRef={messagesEndRef}
                transcriptRef={transcriptRef}
                composerRef={composerRef}
              />
            )}
          </>
        )}

      </main>

      <AgentInstructionsViewer
        isOpen={agentInstructionsOpen}
        onClose={() => setAgentInstructionsOpen(false)}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        repoFullName={connectedGithubRepo?.fullName || 'beardedphil/portfolio-2026-hal'}
      />

      {/* Prompt Modal (0202) */}
      {promptModalMessage && (
        <div className="conversation-modal-overlay" onClick={() => setPromptModalMessage(null)}>
          <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="conversation-modal-header">
              <h3>Sent Prompt</h3>
              <button
                type="button"
                className="conversation-modal-close btn-destructive"
                onClick={() => setPromptModalMessage(null)}
                aria-label="Close prompt modal"
              >
                ×
              </button>
            </div>
            <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {promptModalMessage.promptText ? (
                <>
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (promptModalMessage.promptText) {
                          try {
                            await navigator.clipboard.writeText(promptModalMessage.promptText)
                            // Show brief feedback (could be enhanced with a toast)
                            const btn = document.activeElement as HTMLButtonElement
                            if (btn) {
                              const originalText = btn.textContent
                              btn.textContent = 'Copied!'
                              setTimeout(() => {
                                btn.textContent = originalText
                              }, 2000)
                            }
                          } catch (err) {
                            console.error('Failed to copy prompt:', err)
                          }
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--hal-primary, #007bff)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      Copy prompt
                    </button>
                  </div>
                  <pre
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: 'var(--hal-bg-secondary, #f5f5f5)',
                      padding: '16px',
                      borderRadius: '4px',
                      border: '1px solid var(--hal-border, #ddd)',
                      margin: 0,
                      overflow: 'auto',
                      maxHeight: 'calc(90vh - 120px)',
                    }}
                  >
                    {promptModalMessage.promptText}
                  </pre>
                </>
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-secondary, #666)' }}>
                  <p>Prompt unavailable for this message</p>
                  <p style={{ fontSize: '14px', marginTop: '8px' }}>
                    This message was generated without an external LLM call, or the prompt data is not available.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Process Review Recommendations Modal (0484) */}
      {processReviewRecommendations && processReviewRecommendations.length > 0 && (
        <div
          className="conversation-modal-overlay"
          onClick={() => {
            // Only close if all recommendations are processed
            if (processReviewRecommendations.length === 0) {
              setProcessReviewRecommendations(null)
              setProcessReviewModalTicketPk(null)
              setProcessReviewModalTicketId(null)
              setProcessReviewModalReviewId(null)
            }
          }}
        >
          <div
            className="conversation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="conversation-modal-header">
              <h3>Process Review Recommendations</h3>
              <button
                type="button"
                className="conversation-modal-close btn-destructive"
                onClick={() => {
                  setProcessReviewRecommendations(null)
                  setProcessReviewModalTicketPk(null)
                  setProcessReviewModalTicketId(null)
                  setProcessReviewModalReviewId(null)
                }}
                aria-label="Close recommendations modal"
              >
                ×
              </button>
            </div>
            <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--hal-text-muted)' }}>
                Review the recommendations below. Click "Implement" to create a ticket, or "Ignore" to dismiss.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {processReviewRecommendations.map((recommendation) => (
                  <div
                    key={recommendation.id}
                    style={{
                      border: '1px solid var(--hal-border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: recommendation.error ? 'var(--hal-surface-alt)' : 'var(--hal-surface)',
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                        {recommendation.text}
                      </h4>
                      {recommendation.justification && (
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--hal-text-muted)', fontStyle: 'italic' }}>
                          {recommendation.justification}
                        </p>
                      )}
                    </div>
                    {recommendation.error && (
                      <div
                        style={{
                          marginBottom: '12px',
                          padding: '8px 12px',
                          background: 'var(--hal-status-error, #c62828)',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      >
                        Error: {recommendation.error}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-destructive"
                        onClick={() => handleProcessReviewIgnore(recommendation.id)}
                        disabled={recommendation.isCreating}
                      >
                        Ignore
                      </button>
                      <button
                        type="button"
                        className="btn-standard"
                        onClick={() => handleProcessReviewImplement(recommendation.id)}
                        disabled={recommendation.isCreating}
                      >
                        {recommendation.isCreating ? 'Creating...' : 'Implement'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coverage Report Modal (0693) */}
      <CoverageReportModal isOpen={coverageReportOpen} onClose={() => setCoverageReportOpen(false)} />

      {/* Simplicity Report Modal (0693) */}
      <SimplicityReportModal isOpen={simplicityReportOpen} onClose={() => setSimplicityReportOpen(false)} />
    </div>
  )
}

export default App

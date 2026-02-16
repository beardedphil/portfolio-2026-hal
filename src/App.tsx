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
import { GithubRepoPickerModal } from './components/GithubRepoPickerModal'
import { DisconnectConfirmModal } from './components/DisconnectConfirmModal'
import { PromptModal } from './components/PromptModal'
import { ProcessReviewRecommendationsModal } from './components/ProcessReviewRecommendationsModal'
import { HalHeader } from './components/HalHeader'
import { KanbanErrorBanner } from './components/KanbanErrorBanner'
import { PmChatWidgetButton } from './components/PmChatWidgetButton'
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
import { useMessageManagement } from './hooks/useMessageManagement'
import { useConversationPersistence } from './hooks/useConversationPersistence'
import { useTicketOperations } from './hooks/useTicketOperations'
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
    conversations,
    setConversations,
    setPersistenceError,
    setConversationHistoryResetMessage,
    agentSequenceRefs,
    pmMaxSequenceRef,
    messageIdRef
  )
  const { loadConversationsForProject, getOrCreateConversation, getDefaultConversationId, MESSAGES_PER_PAGE } = conversationsHook

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

  // Conversation persistence via custom hook
  useConversationPersistence({
    conversations,
    connectedProject,
    supabaseUrl,
    supabaseAnonKey,
    agentSequenceRefs,
    pmMaxSequenceRef,
    setPersistenceError,
  })

  // Ticket operations via custom hook
  const { moveTicketToColumn, addAutoMoveDiagnostic } = useTicketOperations({
    supabaseUrl,
    supabaseAnonKey,
    setAutoMoveDiagnostics,
  })

  // getOrCreateConversation and getDefaultConversationId are now provided by useConversations hook

  // Message management via custom hook
  const { addMessage } = useMessageManagement({
    conversations,
    setConversations,
    messageIdRef,
    qaAgentTicketId,
    moveTicketToColumn,
    addAutoMoveDiagnostic,
  })

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
      <HalHeader
        connectedProject={connectedProject}
        connectedGithubRepo={connectedGithubRepo}
        githubAuth={githubAuth}
        onGithubConnect={handleGithubConnect}
        onGithubDisconnect={handleGithubDisconnect}
        onDisconnectClick={handleDisconnectClick}
        disconnectButtonRef={disconnectButtonRef}
        onAgentInstructionsClick={() => setAgentInstructionsOpen(true)}
        onCoverageReportClick={() => setCoverageReportOpen(true)}
        onSimplicityReportClick={() => setSimplicityReportOpen(true)}
      />

      {githubConnectError && (
        <div className="connect-error" role="alert">
          {githubConnectError}
        </div>
      )}

      <GithubRepoPickerModal
        isOpen={githubRepoPickerOpen}
        repos={githubRepos}
        query={githubRepoQuery}
        onQueryChange={setGithubRepoQuery}
        onSelectRepo={handleSelectGithubRepo}
        onClose={() => setGithubRepoPickerOpen(false)}
      />

      <DisconnectConfirmModal
        isOpen={disconnectConfirmOpen}
        onConfirm={handleDisconnectConfirm}
        onCancel={handleDisconnectCancel}
        confirmButtonRef={disconnectConfirmButtonRef}
      />

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
            <KanbanErrorBanner
              error={kanbanMoveError}
              onDismiss={() => setKanbanMoveError(null)}
              connectedProject={connectedProject}
            />
            <KanbanBoard {...kanbanBoardProps} />
          </div>
        </section>

        {/* Floating PM Chat Widget (0698) */}
        {connectedProject && (
          <>
            {!pmChatWidgetOpen && (
              <PmChatWidgetButton
                onClick={() => {
                  setPmChatWidgetOpen(true)
                  setSelectedChatTarget('project-manager')
                  setSelectedConversationId(null)
                }}
              />
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

      <PromptModal message={promptModalMessage} onClose={() => setPromptModalMessage(null)} />

      <ProcessReviewRecommendationsModal
        recommendations={processReviewRecommendations}
        onImplement={handleProcessReviewImplement}
        onIgnore={handleProcessReviewIgnore}
        onClose={() => {
          setProcessReviewRecommendations(null)
          setProcessReviewModalTicketPk(null)
          setProcessReviewModalTicketId(null)
          setProcessReviewModalReviewId(null)
        }}
      />

      {/* Coverage Report Modal (0693) */}
      <CoverageReportModal isOpen={coverageReportOpen} onClose={() => setCoverageReportOpen(false)} />

      {/* Simplicity Report Modal (0693) */}
      <SimplicityReportModal isOpen={simplicityReportOpen} onClose={() => setSimplicityReportOpen(false)} />
    </div>
  )
}

export default App

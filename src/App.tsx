import { useState, useRef, useEffect } from 'react'
import type { Agent, Message, Conversation, ImageAttachment } from './lib/conversationStorage'
import * as Kanban from 'portfolio-2026-kanban'
import type { KanbanBoardProps } from 'portfolio-2026-kanban'
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
import { CoverageReportModal } from './components/CoverageReportModal'
import { MaintainabilityReportModal } from './components/MaintainabilityReportModal'
import { IntegrationManifestModal } from './components/IntegrationManifestModal'
import { ContextBundleModal } from './components/ContextBundleModal'
import { AgentRunBundleModal } from './components/AgentRunBundleModal'
import { NoPrModal } from './components/NoPrModal'
import type { ChatTarget, ToolCallRecord, TicketCreationResult } from './types/app'
import { CHAT_OPTIONS } from './types/app'
import { useGithub } from './hooks/useGithub'
import { useKanban } from './hooks/useKanban'
import { useConversations } from './hooks/useConversations'
import { useAgentRuns } from './hooks/useAgentRuns'
import { useMessageManagement } from './hooks/useMessageManagement'
import { useConversationPersistence } from './hooks/useConversationPersistence'
import { useTicketOperations } from './hooks/useTicketOperations'
import { useProcessReview } from './hooks/useProcessReview'
import { useImageHandling } from './hooks/useImageHandling'
import { useChatHandlers } from './hooks/useChatHandlers'
import { useDisconnect } from './hooks/useDisconnect'
import { useGithubRepoSelection } from './hooks/useGithubRepoSelection'
import { useMessagePagination } from './hooks/useMessagePagination'
import { useKanbanWorkButton } from './hooks/useKanbanWorkButton'
import { useAgentStatusPersistence } from './hooks/useAgentStatusPersistence'
import { useDisconnectHandlers } from './hooks/useDisconnectHandlers'
import { useConversationSelection } from './hooks/useConversationSelection'
import { useProcessReviewWelcome } from './hooks/useProcessReviewWelcome'
import { useConversationLoading } from './hooks/useConversationLoading'
// formatTicketId imported via useProcessReview hook

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
<<<<<<< Updated upstream
  // These are used in logic but not displayed in UI with floating widget (0698)
  const [_lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [_persistenceError, setPersistenceError] = useState<string | null>(null)
  const [_conversationHistoryResetMessage, setConversationHistoryResetMessage] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_openaiLastStatus, _setOpenaiLastStatus] = useState<string | null>(null)
  const [_openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  // Diagnostics panel no longer visible - floating widget replaces sidebar (0698)
  // const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
=======
  const [lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [openaiLastStatus, setOpenaiLastStatus] = useState<string | null>(null)
  const [openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  const [kanbanLoaded, setKanbanLoaded] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [encryptionStatus, setEncryptionStatus] = useState<{ configured: boolean; error?: string } | null>(null)
>>>>>>> Stashed changes
  const [connectedProject, setConnectedProject] = useState<string | null>(null)
  // Theme is always 'dark' (0797: removed theme dropdown)
  const theme = 'dark' as const
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
    setKanbanColumns,
    kanbanAgentRunsByTicketPk,
    setKanbanAgentRunsByTicketPk,
    kanbanRealtimeStatus,
    kanbanLastSync,
    kanbanMoveError,
    setKanbanMoveError,
    noPrModalTicket,
    setNoPrModalTicket,
    retryNoPrPendingMove,
    fetchKanbanData,
    handleKanbanMoveTicket,
    handleKanbanMoveTicketAllowWithoutPr,
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
  const [implAgentRunId, setImplAgentRunId] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('hal-impl-agent-run-id')
      return v && v.trim() ? v.trim() : null
    } catch {
      return null
    }
  })
  const [qaAgentRunId, setQaAgentRunId] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('hal-qa-agent-run-id')
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
  /** Process Review error modal state - shown when recommendations can't be loaded/parsed (0740). */
  const [processReviewErrorModal, setProcessReviewErrorModal] = useState<{
    message: string
    ticketPk: string
    ticketId: string | null
  } | null>(null)
  const [processReviewModalTicketPk, setProcessReviewModalTicketPk] = useState<string | null>(null)
  const [processReviewModalTicketId, setProcessReviewModalTicketId] = useState<string | null>(null)
  const [processReviewModalReviewId, setProcessReviewModalReviewId] = useState<string | null>(null)
  /** Auto-move diagnostics entries (0061) - no longer displayed with floating widget (0698). */
  const [_autoMoveDiagnostics, setAutoMoveDiagnostics] = useState<Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>>([])
  /** Agent type that initiated the current Cursor run (0067). Used to route completion summaries to the correct chat. */
  const [_cursorRunAgentType, setCursorRunAgentType] = useState<Agent | null>(null)
  /** Raw completion summary for troubleshooting when agent type is missing (0067). */
  // Orphaned completion summary - no longer displayed with floating widget (0698)
  const [_orphanedCompletionSummary, setOrphanedCompletionSummary] = useState<string | null>(null)
  /** Floating PM chat widget state (0698). */
  const [pmChatWidgetOpen, setPmChatWidgetOpen] = useState<boolean>(false)
  const [pmChatWidgetFullscreen, setPmChatWidgetFullscreen] = useState<boolean>(false)
  /** Coverage and Maintainability report modals (0693). */
  const [coverageReportOpen, setCoverageReportOpen] = useState<boolean>(false)
  const [maintainabilityReportOpen, setMaintainabilityReportOpen] = useState<boolean>(false)
  /** Integration Manifest modal (0773). */
  const [integrationManifestOpen, setIntegrationManifestOpen] = useState<boolean>(false)
  const [contextBundleModalOpen, setContextBundleModalOpen] = useState<boolean>(false)
  const [contextBundleTicketPk] = useState<string | null>(null)
  const [contextBundleTicketId] = useState<string | null>(null)
  /** Agent Run Bundle Builder modal (0756). */
  const [agentRunBundleModalOpen, setAgentRunBundleModalOpen] = useState<boolean>(false)
  const [agentRunBundleRunId, setAgentRunBundleRunId] = useState<string | null>(null)

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
    // Close prompt modal when switching away from Project Manager (0202)
    if (selectedChatTarget !== 'project-manager') {
      setPromptModalMessage(null)
    }
  }, [selectedChatTarget])

  // Apply dark theme to document root on mount (0797: always dark theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  // Restore connected GitHub repo from localStorage on load (0119: fix repo display after refresh)
  // The repo state is restored for UI display; Kanban will receive the connection message when the iframe loads
  // Note: GitHub hook handles repo restoration, but we need to set connectedProject here
  useEffect(() => {
<<<<<<< Updated upstream
=======
    refreshGithubAuth().catch(() => {})
  }, [refreshGithubAuth])

  // Check encryption status on mount (0786)
  useEffect(() => {
    const checkEncryptionStatus = async () => {
      try {
        const res = await fetch('/api/secrets/status')
        if (res.ok) {
          const data = await res.json() as { configured: boolean; error?: string }
          setEncryptionStatus(data)
        } else {
          setEncryptionStatus({ configured: false, error: 'Failed to check encryption status' })
        }
      } catch (err) {
        setEncryptionStatus({ configured: false, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
    checkEncryptionStatus()
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

    // Tell Kanban iframe which repo is connected (0079)
    if (kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_CONNECT_REPO', repoFullName: repo.full_name },
        window.location.origin
      )
    }

    // If Supabase isn't set yet, use Vercel-provided VITE_ env as default (hosted path)
    if (!supabaseUrl || !supabaseAnonKey) {
      if (url && key) {
        setSupabaseUrl(url)
        setSupabaseAnonKey(key)
        if (kanbanIframeRef.current?.contentWindow) {
          kanbanIframeRef.current.contentWindow.postMessage(
            { type: 'HAL_CONNECT_SUPABASE', url, key },
            window.location.origin
          )
        }
      }
    }

    // Restore agent status from localStorage (0097: preserve agent status across disconnect/reconnect)
    try {
      const savedImplStatus = localStorage.getItem('hal-impl-agent-status')
      if (savedImplStatus && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'completed', 'failed'].includes(savedImplStatus)) {
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
      if (savedQaStatus && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(savedQaStatus)) {
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

    // Load conversations from localStorage first (0097: preserve chats across disconnect/reconnect)
    const loadResult = loadConversationsFromStorage(repo.full_name)
    let restoredConversations = loadResult.conversations || new Map<string, Conversation>()
    if (loadResult.error) {
      setPersistenceError(loadResult.error)
    }

    // Load PM conversations from Supabase and merge (Supabase takes precedence for PM) (HAL_SYNC_COMPLETED will trigger unassigned check when Kanban syncs)
    if (url && key) {
      ;(async () => {
        try {
          const supabase = createClient(url, key)
          const { data: rows, error } = await supabase
            .from('hal_conversation_messages')
            .select('role, content, sequence, created_at')
            .eq('project_id', repo.full_name)
            .eq('agent', PM_AGENT_ID)
            .order('sequence', { ascending: true })
          if (!error && rows && rows.length > 0) {
            const msgs: Message[] = rows.map((r) => ({
              id: r.sequence as number,
              agent: r.role === 'user' ? 'user' : 'project-manager',
              content: r.content ?? '',
              timestamp: r.created_at ? new Date(r.created_at) : new Date(),
            }))
            const maxSeq = Math.max(...msgs.map((m) => m.id))
            pmMaxSequenceRef.current = maxSeq
            messageIdRef.current = maxSeq
            const pmConvId = getConversationId('project-manager', 1)
            const pmConversation: Conversation = {
              id: pmConvId,
              agentRole: 'project-manager',
              instanceNumber: 1,
              messages: msgs,
              createdAt: msgs.length > 0 ? msgs[0].timestamp : new Date(),
            }
            // Merge: Supabase PM conversation takes precedence, but keep other agent conversations from localStorage
            restoredConversations.set(pmConvId, pmConversation)
          }
          // Set merged conversations (PM from Supabase if available, others from localStorage)
          setConversations(restoredConversations)
          setPersistenceError(null)
        } catch {
          // If Supabase load fails, still use localStorage conversations
          setConversations(restoredConversations)
        }
      })()
    } else {
      // No Supabase, just use localStorage conversations
      setConversations(restoredConversations)
    }

    setGithubRepoPickerOpen(false)
  }, [supabaseUrl, supabaseAnonKey])

  // Send theme to Kanban iframe when theme changes or iframe loads (0078)
  useEffect(() => {
    if (kanbanLoaded && kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_THEME_CHANGE', theme },
        '*'
      )
    }
  }, [theme, kanbanLoaded])



  // When Kanban iframe loads, push current repo + Supabase so it syncs (iframe may load after user connected)
  useEffect(() => {
    if (!kanbanLoaded || !kanbanIframeRef.current?.contentWindow) return
    const win = kanbanIframeRef.current.contentWindow
    const origin = window.location.origin
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (url && key) {
      win.postMessage({ type: 'HAL_CONNECT_SUPABASE', url, key }, origin)
    }
>>>>>>> Stashed changes
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
  const { loadConversationsForProject, getOrCreateConversation, getDefaultConversationId } = conversationsHook

  // loadConversationsForProject is now provided by useConversations hook

  // Wrapper functions for type compatibility
  const getDefaultConversationIdWrapper = (agentRole: string) => getDefaultConversationId(agentRole as Agent)
  const getDefaultConversationIdForAgent = (agentRole: Agent) => getDefaultConversationId(agentRole)
  const setImplAgentRunStatusWrapper = (status: string) => setImplAgentRunStatus(status as any)
  const setQaAgentRunStatusWrapper = (status: string) => setQaAgentRunStatus(status as any)
  const setLastPmToolCallsWrapper = (calls: unknown[] | null) => setLastPmToolCalls(calls as ToolCallRecord[] | null)
  const setCursorRunAgentTypeWrapper = (type: string | null) => setCursorRunAgentType(type as Agent | null)
  const addMessageForProcessReview = (
    conversationId: string,
    agent: 'process-review-agent',
    content: string,
    id?: number,
    imageAttachments?: unknown[],
    promptText?: string
  ) => addMessage(conversationId, agent, content, id, imageAttachments as ImageAttachment[] | undefined, promptText)
  const triggerAgentRunWrapper = (content: string, target: ChatTarget, imageAttachments?: unknown[], conversationId?: string) => 
    triggerAgentRun(content, target, imageAttachments as ImageAttachment[] | undefined, conversationId)
  // Pass setters directly - they're already the correct type
  const setProcessReviewStatusWrapper = setProcessReviewStatus
  const setProcessReviewAgentRunStatusWrapper: React.Dispatch<React.SetStateAction<string>> = (status) => {
    if (typeof status === 'function') {
      setProcessReviewAgentRunStatus(status as any)
    } else {
      setProcessReviewAgentRunStatus(status as any)
    }
  }

  // GitHub repo selection via custom hook
  const { handleSelectGithubRepo } = useGithubRepoSelection({
    setConnectedGithubRepo,
    setConnectedProject,
    supabaseUrl,
    setSupabaseUrl,
    supabaseAnonKey,
    setSupabaseAnonKey,
    setImplAgentRunStatus: setImplAgentRunStatusWrapper,
    setImplAgentProgress,
    setImplAgentError,
    setQaAgentRunStatus: setQaAgentRunStatusWrapper,
    setQaAgentProgress,
    setQaAgentError,
    loadConversationsForProject,
    setGithubRepoPickerOpen,
  })

  // Conversation selection persistence via custom hook
  const { restoredSelectedConvRef } = useConversationSelection({
    connectedProject,
    selectedConversationId,
    setSelectedConversationId,
    conversations,
  })

  // Conversation loading via custom hook
  useConversationLoading({
    connectedProject,
    loadConversationsForProject,
    restoredSelectedConvRef,
  })


  // Auto-expand groups no longer needed - floating widget replaces sidebar (0698)

  // No longer needed - floating chat widget replaces sidebar (0698)

  // Agent status persistence via custom hook
  useAgentStatusPersistence({
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
  })

  // Fetch working memory when PM conversation changes (0173) - moved after fetchPmWorkingMemory definition
  // (This useEffect is defined later after fetchPmWorkingMemory is declared)

  // Message pagination and scroll effects via custom hook
  const { pmMessages } = useMessagePagination({
    connectedProject,
    supabaseUrl,
    supabaseAnonKey,
    conversations,
    setConversations,
    loadingOlderMessages,
    setLoadingOlderMessages,
    transcriptRef,
    selectedConversationId,
    selectedChatTarget,
    agentTypingTarget,
    implAgentRunStatus,
    qaAgentRunStatus,
    processReviewAgentRunStatus,
    implAgentProgress,
    qaAgentProgress,
    processReviewAgentProgress,
    pmChatWidgetOpen,
    messagesEndRef,
  })

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
    setAutoMoveDiagnostics,
  })

  // getOrCreateConversation and getDefaultConversationId are now provided by useConversations hook

  // Message management via custom hook
  const { addMessage, upsertMessage, appendToMessage } = useMessageManagement({
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

  // Process Review welcome message via custom hook
  useProcessReviewWelcome({
    conversations,
    supabaseUrl,
    supabaseAnonKey,
    addMessage: addMessageForProcessReview,
  })


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
    upsertMessage,
    appendToMessage,
    getDefaultConversationId: getDefaultConversationIdWrapper,
    setLastAgentError,
    setOpenaiLastError,
    setLastPmOutboundRequest,
    setLastPmToolCalls: setLastPmToolCallsWrapper,
    setAgentTypingTarget,
    setPersistenceError,
    implAgentTicketId,
    qaAgentTicketId,
    setImplAgentTicketId,
    setQaAgentTicketId,
    setImplAgentRunId,
    setQaAgentRunId,
    setImplAgentRunStatus: setImplAgentRunStatusWrapper,
    setQaAgentRunStatus: setQaAgentRunStatusWrapper,
    setImplAgentProgress,
    setQaAgentProgress,
    setImplAgentError,
    setQaAgentError,
    setCursorRunAgentType: setCursorRunAgentTypeWrapper,
    setOrphanedCompletionSummary,
    kanbanTickets,
    handleKanbanMoveTicket,
    fetchKanbanData,
  })
  const { triggerAgentRun } = agentRuns

  // Track most recent work button click event for diagnostics (0072) - no longer displayed with floating widget (0698)
  const [_lastWorkButtonClick, setLastWorkButtonClick] = useState<{ eventId: string; timestamp: Date; chatTarget: ChatTarget; message: string } | null>(null)

  const [noPrModalBusy, setNoPrModalBusy] = useState(false)

  // Kanban work button handler via custom hook
  const { handleKanbanOpenChatAndSend } = useKanbanWorkButton({
    triggerAgentRun: triggerAgentRunWrapper,
    getDefaultConversationId: getDefaultConversationIdForAgent,
    kanbanTickets,
    handleKanbanMoveTicket,
    handleKanbanMoveTicketAllowWithoutPr,
    pmChatWidgetOpen,
    setPmChatWidgetOpen,
    setSelectedChatTarget,
    setSelectedConversationId,
    setLastWorkButtonClick,
  })

  // Process Review handlers via custom hook
  const processReview = useProcessReview({
    supabaseUrl,
    supabaseAnonKey,
    getOrCreateConversation,
    addMessage,
    upsertMessage,
    appendToMessage,
    kanbanTickets,
    handleKanbanMoveTicket,
    processReviewRecommendations,
    setProcessReviewRecommendations,
    processReviewModalTicketPk,
    processReviewModalTicketId,
    processReviewModalReviewId,
    setProcessReviewModalTicketPk,
    setProcessReviewModalTicketId,
    setProcessReviewModalReviewId,
    setProcessReviewStatus: setProcessReviewStatusWrapper,
    setProcessReviewTicketPk,
    setProcessReviewAgentRunStatus: setProcessReviewAgentRunStatusWrapper,
    setProcessReviewAgentError: setProcessReviewAgentError,
    setProcessReviewAgentTicketId: setProcessReviewAgentTicketId,
    setProcessReviewAgentProgress: setProcessReviewAgentProgress,
  })
  const { handleKanbanProcessReview, handleProcessReviewImplement, handleProcessReviewIgnore } = processReview

  // Image handling via custom hook
  const { handleImageSelect, handleRemoveImage } = useImageHandling({
    setImageAttachment,
    setImageError,
  })

  // Chat handlers via custom hook
  const { handleSendForTarget, handleContinueBatch } = useChatHandlers({
    inputValue,
    setInputValue,
    imageAttachment,
    setImageAttachment,
    imageError,
    setImageError,
    setSendValidationError,
    conversations,
    getDefaultConversationId,
    addMessage,
    triggerAgentRun,
    setLastSendPayloadSummary,
    setLastAgentError,
  })



  // Disconnect handler via custom hook
  const { handleDisconnect } = useDisconnect({
    setKanbanTickets,
    setKanbanColumns,
    setKanbanAgentRunsByTicketPk,
    setLastError,
    setConversations,
    messageIdRef,
    pmMaxSequenceRef,
    setPersistenceError,
    setConnectedProject,
    setConnectedGithubRepo,
    setLastTicketCreationResult,
    setLastCreateTicketAvailable,
    setSupabaseUrl,
    setSupabaseAnonKey,
    setUnreadByTarget,
    setImplAgentTicketId,
    setQaAgentTicketId,
    setAutoMoveDiagnostics,
    setCursorRunAgentType,
    setOrphanedCompletionSummary,
    setPmWorkingMemoryOpen: _setPmWorkingMemoryOpen,
  })

  // Disconnect handlers via custom hook
  const { handleDisconnectClick, handleDisconnectConfirm, handleDisconnectCancel } = useDisconnectHandlers({
    disconnectConfirmOpen,
    setDisconnectConfirmOpen,
    handleDisconnect,
    disconnectButtonRef,
    disconnectConfirmButtonRef,
  })


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
        onCoverageReportClick={() => setCoverageReportOpen(true)}
        onMaintainabilityReportClick={() => setMaintainabilityReportOpen(true)}
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

      <NoPrModal
        isOpen={!!noPrModalTicket}
        ticketId={noPrModalTicket?.ticketId}
        ticketDisplayId={noPrModalTicket?.displayId}
        busy={noPrModalBusy}
        onClose={() => setNoPrModalTicket(null)}
        onCreatePr={() => {
          ;(async () => {
            if (!noPrModalTicket?.pk) return
            if (!connectedGithubRepo?.fullName) {
              alert('Please connect a GitHub repository first to create a Pull Request.')
              return
            }
            try {
              setNoPrModalBusy(true)
              const res = await fetch('/api/tickets/create-pr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  ticketPk: noPrModalTicket.pk,
                  repoFullName: connectedGithubRepo.fullName,
                  defaultBranch: connectedGithubRepo.defaultBranch || 'main',
                }),
              })
              const data = (await res.json().catch(() => ({}))) as { success?: boolean; prUrl?: string; error?: string }
              if (!res.ok || !data.success) {
                throw new Error(data.error || `Create PR failed (HTTP ${res.status})`)
              }
              await retryNoPrPendingMove()
              setNoPrModalTicket(null)
              fetchKanbanData().catch(() => {})
              if (data.prUrl) window.open(data.prUrl, '_blank')
            } catch (e) {
              alert(e instanceof Error ? e.message : String(e))
            } finally {
              setNoPrModalBusy(false)
            }
          })()
        }}
        onLinkPr={() => {
          ;(async () => {
            if (!noPrModalTicket?.pk) return
            if (!connectedGithubRepo?.fullName) {
              alert('Please connect a GitHub repository first to link a Pull Request.')
              return
            }
            const prUrl = window.prompt('Paste the GitHub Pull Request URL to link:', '')
            if (!prUrl || !prUrl.trim()) return
            try {
              setNoPrModalBusy(true)
              const res = await fetch('/api/tickets/link-pr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  ticketPk: noPrModalTicket.pk,
                  repoFullName: connectedGithubRepo.fullName,
                  prUrl: prUrl.trim(),
                }),
              })
              const data = (await res.json().catch(() => ({}))) as { success?: boolean; prUrl?: string; error?: string }
              if (!res.ok || !data.success) {
                throw new Error(data.error || `Link PR failed (HTTP ${res.status})`)
              }
              await retryNoPrPendingMove()
              setNoPrModalTicket(null)
              fetchKanbanData().catch(() => {})
              if (data.prUrl) window.open(data.prUrl, '_blank')
            } catch (e) {
              alert(e instanceof Error ? e.message : String(e))
            } finally {
              setNoPrModalBusy(false)
            }
          })()
        }}
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
<<<<<<< Updated upstream
              />
=======
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpenChatTarget('project-manager')
                    setSelectedChatTarget('project-manager')
                    setSelectedConversationId(null)
                    setUnreadByTarget((prev) => ({ ...prev, 'project-manager': 0 }))
                  }
                }}
              >
                <div className="chat-preview-header">
                  <span className="chat-preview-name">Project Manager</span>
                  {unreadByTarget['project-manager'] > 0 && (
                    <span className="chat-preview-unread">{unreadByTarget['project-manager']}</span>
                  )}
                </div>
                <div className="chat-preview-text">{getChatTargetPreview('project-manager')}</div>
              </div>

              {/* Standup */}
              <div
                className={`chat-preview-pane ${openChatTarget === 'standup' ? 'chat-preview-active' : ''}`}
                onClick={() => {
                  setOpenChatTarget('standup')
                  setSelectedChatTarget('standup')
                  setSelectedConversationId(null)
                  setUnreadByTarget((prev) => ({ ...prev, standup: 0 }))
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpenChatTarget('standup')
                    setSelectedChatTarget('standup')
                    setSelectedConversationId(null)
                    setUnreadByTarget((prev) => ({ ...prev, standup: 0 }))
                  }
                }}
              >
                <div className="chat-preview-header">
                  <span className="chat-preview-name">Standup (all agents)</span>
                  {unreadByTarget.standup > 0 && (
                    <span className="chat-preview-unread">{unreadByTarget.standup}</span>
                  )}
                </div>
                <div className="chat-preview-text">{getChatTargetPreview('standup')}</div>
              </div>

              {/* QA Group */}
              <div className="chat-preview-group">
                <div
                  className="chat-preview-group-header"
                  onClick={() => setQaGroupExpanded(!qaGroupExpanded)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setQaGroupExpanded(!qaGroupExpanded)
                    }
                  }}
                >
                  <span className="chat-preview-group-icon">{qaGroupExpanded ? '▼' : '▶'}</span>
                  <span className="chat-preview-name">QA Lead</span>
                  {unreadByTarget['qa-agent'] > 0 && (
                    <span className="chat-preview-unread">{unreadByTarget['qa-agent']}</span>
                  )}
                </div>
                {qaGroupExpanded && (
                  <div className="chat-preview-group-items">
                    {getConversationsForAgent('qa-agent').length === 0 ? (
                      <div className="chat-preview-empty">No QA agents running</div>
                    ) : (
                      getConversationsForAgent('qa-agent').map((conv) => (
                        <div
                          key={conv.id}
                          className={`chat-preview-pane chat-preview-nested ${openChatTarget === conv.id ? 'chat-preview-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenChatTarget(conv.id)
                            setSelectedChatTarget('qa-agent')
                            setSelectedConversationId(conv.id)
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setOpenChatTarget(conv.id)
                              setSelectedChatTarget('qa-agent')
                              setSelectedConversationId(conv.id)
                            }
                          }}
                        >
                          <div className="chat-preview-header">
                            <span className="chat-preview-name">{getConversationLabel(conv)}</span>
                          </div>
                          <div className="chat-preview-text">{getConversationPreview(conv)}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Implementation Group */}
              <div className="chat-preview-group">
                <div
                  className="chat-preview-group-header"
                  onClick={() => setImplGroupExpanded(!implGroupExpanded)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setImplGroupExpanded(!implGroupExpanded)
                    }
                  }}
                >
                  <span className="chat-preview-group-icon">{implGroupExpanded ? '▼' : '▶'}</span>
                  <span className="chat-preview-name">Implementation Lead</span>
                  {unreadByTarget['implementation-agent'] > 0 && (
                    <span className="chat-preview-unread">{unreadByTarget['implementation-agent']}</span>
                  )}
                </div>
                {implGroupExpanded && (
                  <div className="chat-preview-group-items">
                    {getConversationsForAgent('implementation-agent').length === 0 ? (
                      <div className="chat-preview-empty">No Implementation agents running</div>
                    ) : (
                      getConversationsForAgent('implementation-agent').map((conv) => (
                        <div
                          key={conv.id}
                          className={`chat-preview-pane chat-preview-nested ${openChatTarget === conv.id ? 'chat-preview-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenChatTarget(conv.id)
                            setSelectedChatTarget('implementation-agent')
                            setSelectedConversationId(conv.id)
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setOpenChatTarget(conv.id)
                              setSelectedChatTarget('implementation-agent')
                              setSelectedConversationId(conv.id)
                            }
                          }}
                        >
                          <div className="chat-preview-header">
                            <span className="chat-preview-name">{getConversationLabel(conv)}</span>
                          </div>
                          <div className="chat-preview-text">{getConversationPreview(conv)}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!connectedProject ? (
            <div className="chat-placeholder">
              <p className="chat-placeholder-text">Connect a project to enable chat</p>
              <p className="chat-placeholder-hint">
                Use the "Connect GitHub Repo" button above to connect a project and start chatting with agents.
              </p>
            </div>
          ) : null}

          {/* Agent Status Boxes (0087) - shown at bottom of Chat pane for working agents only */}
          {connectedProject && (
            <div className="agent-status-boxes">
              {/* Implementation Agent status box - only show when working (not idle, not completed) */}
              {implAgentRunStatus !== 'idle' && implAgentRunStatus !== 'completed' && (
                <div className="agent-status-box">
                  <div className="agent-status-box-header">
                    <span className="agent-status-box-name">Implementation Agent</span>
                    <span className={`agent-status-box-status agent-status-${implAgentRunStatus}`}>
                      {formatAgentStatus(implAgentRunStatus)}
                    </span>
                  </div>
                  {implAgentError && (
                    <div className="agent-status-box-error" role="alert">
                      {implAgentError}
                    </div>
                  )}
                </div>
              )}
              {/* QA Agent status box - only show when working (not idle, not completed) */}
              {qaAgentRunStatus !== 'idle' && qaAgentRunStatus !== 'completed' && (
                <div className="agent-status-box">
                  <div className="agent-status-box-header">
                    <span className="agent-status-box-name">QA Agent</span>
                    <span className={`agent-status-box-status agent-status-${qaAgentRunStatus}`}>
                      {formatAgentStatus(qaAgentRunStatus)}
                    </span>
                  </div>
                  {qaAgentError && (
                    <div className="agent-status-box-error" role="alert">
                      {qaAgentError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Configuration Status Panel (0042) */}
          <div className="config-status-panel" role="region" aria-label="Configuration Status">
            <h3 className="config-status-title">Configuration</h3>
            <div className="config-status-row">
              <span className="config-status-label">Cursor API:</span>
              {import.meta.env.VITE_CURSOR_API_KEY ? (
                <span className="config-status-value config-status-configured">Configured</span>
              ) : (
                <span className="config-status-value config-status-not-configured">
                  Not configured
                  <span className="config-status-hint">Missing CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env</span>
                </span>
              )}
            </div>
          </div>

          {/* Diagnostics panel */}
          <div className="diagnostics-section">
            <button
              type="button"
              className="diagnostics-toggle"
              onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
              aria-expanded={diagnosticsOpen}
            >
              Diagnostics {diagnosticsOpen ? '▼' : '▶'}
            </button>
            
            {diagnosticsOpen && (
              <div className="diagnostics-panel" role="region" aria-label="Diagnostics">
                <div className="diag-row">
                  <span className="diag-label">Chat width (px):</span>
                  <span className="diag-value">{chatWidth}</span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Chat width (%):</span>
                  <span className="diag-value">
                    {(() => {
                      const mainElement = document.querySelector('.hal-main')
                      if (!mainElement) return '—'
                      const mainRect = mainElement.getBoundingClientRect()
                      const percentage = (chatWidth / mainRect.width) * 100
                      return `${percentage.toFixed(1)}%`
                    })()}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Resizer dragging:</span>
                  <span className="diag-value" data-status={isDragging ? 'ok' : undefined}>
                    {String(isDragging)}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Theme:</span>
                  <span className="diag-value">
                    {diagnostics.theme} ({diagnostics.themeSource})
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Kanban render mode:</span>
                  <span className="diag-value">{diagnostics.kanbanRenderMode}</span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Kanban URL:</span>
                  <span className="diag-value">{diagnostics.kanbanUrl}</span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Kanban loaded:</span>
                  <span className="diag-value" data-status={diagnostics.kanbanLoaded ? 'ok' : 'error'}>
                    {String(diagnostics.kanbanLoaded)}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Chat target:</span>
                  <span className="diag-value">{diagnostics.selectedChatTarget}</span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">PM implementation source:</span>
                  <span className="diag-value">{diagnostics.pmImplementationSource}</span>
                </div>
                {lastWorkButtonClick && (
                  <div className="diag-row">
                    <span className="diag-label">Last work button click:</span>
                    <span className="diag-value">
                      {lastWorkButtonClick.eventId} ({lastWorkButtonClick.timestamp.toLocaleTimeString()})
                      <br />
                      <span style={{ fontSize: '0.9em', color: '#666' }}>
                        Target: {lastWorkButtonClick.chatTarget}
                      </span>
                    </span>
                  </div>
                )}
                {selectedChatTarget === 'project-manager' && (
                  <div className="diag-row">
                    <span className="diag-label">Agent runner:</span>
                    <span className="diag-value">{diagnostics.agentRunner ?? '—'}</span>
                  </div>
                )}
                <div className="diag-row">
                  <span className="diag-label">Last agent error:</span>
                  <span className="diag-value" data-status={diagnostics.lastAgentError ? 'error' : 'ok'}>
                    {diagnostics.lastAgentError ?? 'none'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Last OpenAI HTTP status:</span>
                  <span className="diag-value">
                    {diagnostics.openaiLastStatus ?? 'no request yet'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Last OpenAI error:</span>
                  <span className="diag-value" data-status={diagnostics.openaiLastError ? 'error' : 'ok'}>
                    {diagnostics.openaiLastError ?? 'none'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Last error:</span>
                  <span className="diag-value" data-status={diagnostics.lastError ? 'error' : 'ok'}>
                    {diagnostics.lastError ?? 'none'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Last send payload summary:</span>
                  <span className="diag-value">
                    {diagnostics.lastSendPayloadSummary ?? 'no send yet'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Connected project:</span>
                  <span className="diag-value">
                    {diagnostics.connectedProject ?? 'none'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Repo inspection (GitHub):</span>
                  <span className="diag-value" data-status={diagnostics.repoInspectionAvailable ? 'ok' : 'error'} title={diagnostics.repoInspectionAvailable ? 'PM agent can read/search repo via GitHub API' : 'Connect GitHub Repo for read_file/search_files'}>
                    {diagnostics.repoInspectionAvailable ? 'available' : 'not available'}
                  </span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Persistence error:</span>
                  <span className="diag-value" data-status={diagnostics.persistenceError ? 'error' : 'ok'}>
                    {diagnostics.persistenceError ?? 'none'}
                  </span>
                </div>
                {selectedChatTarget === 'project-manager' && (
                  <>
                    <div className="diag-row">
                      <span className="diag-label">PM last response ID:</span>
                      <span className="diag-value">
                        {diagnostics.pmLastResponseId ?? 'none (continuity not used yet)'}
                      </span>
                    </div>
                    <div className="diag-row">
                      <span className="diag-label">previous_response_id in last request:</span>
                      <span className="diag-value" data-status={diagnostics.previousResponseIdInLastRequest ? 'ok' : undefined}>
                        {diagnostics.previousResponseIdInLastRequest ? 'yes' : 'no'}
                      </span>
                    </div>
                  </>
                )}

                {/* PM Diagnostics: Outbound Request */}
                {selectedChatTarget === 'project-manager' && (
                  <div className="diag-section">
                    <button
                      type="button"
                      className="diag-section-toggle"
                      onClick={() => setOutboundRequestExpanded(!outboundRequestExpanded)}
                      aria-expanded={outboundRequestExpanded}
                    >
                      Outbound Request JSON {outboundRequestExpanded ? '▼' : '▶'}
                    </button>
                    {outboundRequestExpanded && (
                      <div className="diag-section-content">
                        {diagnostics.lastPmOutboundRequest ? (
                          <pre className="diag-json">
                            {JSON.stringify(diagnostics.lastPmOutboundRequest, null, 2)}
                          </pre>
                        ) : (
                          <span className="diag-empty">No request yet</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* PM Diagnostics: Tool Calls */}
                {selectedChatTarget === 'project-manager' && (
                  <div className="diag-section">
                    <button
                      type="button"
                      className="diag-section-toggle"
                      onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
                      aria-expanded={toolCallsExpanded}
                    >
                      Tool Calls {toolCallsExpanded ? '▼' : '▶'}
                    </button>
                    {toolCallsExpanded && (
                      <div className="diag-section-content">
                        {diagnostics.lastPmToolCalls && diagnostics.lastPmToolCalls.length > 0 ? (
                          <ul className="diag-tool-calls">
                            {diagnostics.lastPmToolCalls.map((call, idx) => (
                              <li key={idx} className="diag-tool-call">
                                <strong>{call.name}</strong>
                                <div className="tool-call-detail">
                                  <span className="tool-call-label">Input:</span>
                                  <code>{JSON.stringify(call.input)}</code>
                                </div>
                                <div className="tool-call-detail">
                                  <span className="tool-call-label">Output:</span>
                                  <code className="tool-call-output">
                                    {typeof call.output === 'string'
                                      ? call.output.length > 200
                                        ? call.output.slice(0, 200) + '...'
                                        : call.output
                                      : JSON.stringify(call.output).slice(0, 200)}
                                  </code>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="diag-empty">No tool calls</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Encryption Status (0786) */}
                <div className="diag-section">
                  <div className="diag-section-header">Secrets Encryption</div>
                  <div className="diag-section-content">
                    {encryptionStatus === null ? (
                      <span className="diag-empty">Checking...</span>
                    ) : encryptionStatus.configured ? (
                      <span className="diag-sync-ok">Secrets stored encrypted at rest</span>
                    ) : (
                      <span className="diag-sync-error">
                        Not configured
                        {encryptionStatus.error && <> — {encryptionStatus.error}</>}
                      </span>
                    )}
                  </div>
                </div>

                {/* PM Diagnostics: Create ticket availability (0011) */}
                {selectedChatTarget === 'project-manager' && diagnostics.lastCreateTicketAvailable != null && (
                  <div className="diag-section">
                    <div className="diag-section-header">Create ticket (this request)</div>
                    <div className="diag-section-content">
                      {diagnostics.lastCreateTicketAvailable ? (
                        <span className="diag-sync-ok">Available (Supabase creds were sent)</span>
                      ) : (
                        <span className="diag-sync-error">Not available — connect project folder with .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)</span>
                      )}
                    </div>
                  </div>
                )}

                {/* PM Diagnostics: Ticket creation (0011) */}
                {selectedChatTarget === 'project-manager' && diagnostics.lastTicketCreationResult && (
                  <div className="diag-section">
                    <div className="diag-section-header">Ticket creation</div>
                    <div className="diag-section-content">
                      <div className="diag-ticket-creation">
                        <div><strong>Ticket ID:</strong> {diagnostics.lastTicketCreationResult.id}</div>
                        <div><strong>File path:</strong> {diagnostics.lastTicketCreationResult.filePath}</div>
                        {diagnostics.lastTicketCreationResult.retried && diagnostics.lastTicketCreationResult.attempts != null && (
                          <div><strong>Retry:</strong> Collision resolved after {diagnostics.lastTicketCreationResult.attempts} attempt(s)</div>
                        )}
                        <div>
                          <strong>Sync:</strong>{' '}
                          {diagnostics.lastTicketCreationResult.syncSuccess ? (
                            <span className="diag-sync-ok">Success</span>
                          ) : (
                            <span className="diag-sync-error">
                              Failed
                              {diagnostics.lastTicketCreationResult.syncError && (
                                <> — {diagnostics.lastTicketCreationResult.syncError}</>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PM Diagnostics: Ticket readiness evaluation (0066) */}
                {selectedChatTarget === 'project-manager' && diagnostics.lastPmToolCalls && (() => {
                  const createTicketCall = diagnostics.lastPmToolCalls.find(c => c.name === 'create_ticket')
                  const updateTicketCall = diagnostics.lastPmToolCalls.find(c => c.name === 'update_ticket_body')
                  const readinessCall = createTicketCall || updateTicketCall
                  if (!readinessCall) return null
                  
                  const output = readinessCall.output as any
                  const isSuccess = output?.success === true
                  const isRejected = output?.success === false && output?.detectedPlaceholders
                  const hasReadiness = isSuccess && (output?.ready !== undefined || output?.missingItems)
                  
                  if (!isRejected && !hasReadiness) return null
                  
                  return (
                    <div className="diag-section">
                      <div className="diag-section-header">Ticket readiness evaluation</div>
                      <div className="diag-section-content">
                        {isRejected ? (
                          <div className="diag-ticket-readiness">
                            <div>
                              <strong>Status:</strong>{' '}
                              <span className="diag-sync-error">REJECTED</span>
                            </div>
                            <div>
                              <strong>Reason:</strong> Unresolved template placeholder tokens detected
                            </div>
                            {output.detectedPlaceholders && Array.isArray(output.detectedPlaceholders) && output.detectedPlaceholders.length > 0 && (
                              <div>
                                <strong>Detected placeholders:</strong>{' '}
                                <code>{output.detectedPlaceholders.join(', ')}</code>
                              </div>
                            )}
                            {output.error && (
                              <div className="diag-readiness-error">
                                <strong>Error message:</strong> {output.error}
                              </div>
                            )}
                          </div>
                        ) : isSuccess && hasReadiness ? (
                          <div className="diag-ticket-readiness">
                            <div>
                              <strong>Status:</strong>{' '}
                              {output.ready ? (
                                <span className="diag-sync-ok">PASS</span>
                              ) : (
                                <span className="diag-sync-error">FAIL</span>
                              )}
                            </div>
                            {output.missingItems && Array.isArray(output.missingItems) && output.missingItems.length > 0 && (
                              <div>
                                <strong>Missing items:</strong>
                                <ul style={{ marginTop: '0.5em', marginBottom: '0.5em', paddingLeft: '1.5em' }}>
                                  {output.missingItems.map((item: string, idx: number) => (
                                    <li key={idx}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })()}

                {/* Auto-move diagnostics (0061) */}
                {(selectedChatTarget === 'implementation-agent' || selectedChatTarget === 'qa-agent' || selectedChatTarget === 'project-manager') && diagnostics.autoMoveDiagnostics.length > 0 && (
                  <div className="diag-section">
                    <div className="diag-section-header">Auto-move diagnostics</div>
                    <div className="diag-section-content">
                      <div className="diag-auto-move-list">
                        {diagnostics.autoMoveDiagnostics.slice(-10).map((entry, idx) => (
                          <div key={idx} className={`diag-auto-move-entry diag-auto-move-${entry.type}`}>
                            <span className="diag-auto-move-time">[{formatTime(entry.timestamp)}]</span>
                            <span className="diag-auto-move-message">{entry.message}</span>
                          </div>
                        ))}
                        {diagnostics.autoMoveDiagnostics.length > 10 && (
                          <div className="diag-auto-move-more">
                            ({diagnostics.autoMoveDiagnostics.length - 10} older entries)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Orphaned completion summary (0067) */}
                {orphanedCompletionSummary && (
                  <div className="diag-section">
                    <div className="diag-section-header">Orphaned completion summary</div>
                    <div className="diag-section-content">
                      <div className="diag-auto-move-entry diag-auto-move-error">
                        <span className="diag-auto-move-message">
                          Completion summary received but agent type could not be determined. Raw summary retained for troubleshooting:
                        </span>
                      </div>
                      <pre className="diag-json" style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>
                        {orphanedCompletionSummary}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
>>>>>>> Stashed changes
            )}
            {pmChatWidgetOpen && (
        <PmChatWidget
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
        supabaseUrl={supabaseUrl ?? undefined}
        supabaseAnonKey={supabaseAnonKey ?? undefined}
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

      {/* Process Review Error Modal (0740) - shown when recommendations can't be loaded/parsed */}
      {processReviewErrorModal && (
        <div
          className="conversation-modal-overlay"
          onClick={() => {
            setProcessReviewErrorModal(null)
          }}
        >
          <div
            className="conversation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column' }}
          >
            <div className="conversation-modal-header">
              <h3>Process Review Error</h3>
              <button
                type="button"
                className="conversation-modal-close btn-destructive"
                onClick={() => {
                  setProcessReviewErrorModal(null)
                }}
                aria-label="Close error modal"
              >
                ×
              </button>
            </div>
            <div className="conversation-modal-content" style={{ padding: '24px' }}>
              <div
                style={{
                  marginBottom: '20px',
                  padding: '16px',
                  background: 'var(--hal-status-error, #c62828)',
                  color: 'white',
                  borderRadius: '8px',
                }}
              >
                <p style={{ margin: 0, fontWeight: '600' }}>⚠️ Process Review Error</p>
                <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
                  {processReviewErrorModal.message}
                </p>
              </div>
              <p style={{ marginBottom: '20px', color: 'var(--hal-text-muted)' }}>
                The Process Review completed, but the recommendations could not be loaded or parsed from the agent's response.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-destructive"
                  onClick={() => {
                    setProcessReviewErrorModal(null)
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={async () => {
                    setProcessReviewErrorModal(null)
                    // Trigger Process Review again by calling the handler
                    if (processReviewErrorModal.ticketPk) {
                      const ticket = kanbanTickets.find((t) => t.pk === processReviewErrorModal.ticketPk)
                      if (ticket) {
                        await handleKanbanProcessReview({
                          ticketPk: processReviewErrorModal.ticketPk,
                          ticketId: processReviewErrorModal.ticketId || undefined,
                        })
                      }
                    }
                  }}
                >
                  Retry Process Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Coverage Report Modal (0693) */}
      <CoverageReportModal isOpen={coverageReportOpen} onClose={() => setCoverageReportOpen(false)} />

      {/* Maintainability Report Modal (0693) */}
      <MaintainabilityReportModal isOpen={maintainabilityReportOpen} onClose={() => setMaintainabilityReportOpen(false)} />

      {/* Integration Manifest Modal (0773) */}
      <IntegrationManifestModal
        isOpen={integrationManifestOpen}
        onClose={() => setIntegrationManifestOpen(false)}
        repoFullName={connectedGithubRepo?.fullName || null}
        defaultBranch={connectedGithubRepo?.defaultBranch || 'main'}
      />

      {/* Context Bundle Modal (0761) */}
      <ContextBundleModal
        isOpen={contextBundleModalOpen}
        onClose={() => setContextBundleModalOpen(false)}
        ticketPk={contextBundleTicketPk}
        ticketId={contextBundleTicketId}
        repoFullName={connectedGithubRepo?.fullName || null}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
      />
      {/* Agent Run Bundle Builder Modal (0756) */}
      <AgentRunBundleModal
        isOpen={agentRunBundleModalOpen}
        onClose={() => {
          setAgentRunBundleModalOpen(false)
          setAgentRunBundleRunId(null)
        }}
        runId={agentRunBundleRunId || implAgentRunId || qaAgentRunId}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
      />
    </div>
  )
}

export default App

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
import { DiagnosticsModal } from './components/DiagnosticsModal'
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
  // These are used in logic but not displayed in UI with floating widget (0698)
  const [_lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [_persistenceError, setPersistenceError] = useState<string | null>(null)
  const [_conversationHistoryResetMessage, setConversationHistoryResetMessage] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_openaiLastStatus, _setOpenaiLastStatus] = useState<string | null>(null)
  const [_openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  // Diagnostics panel no longer visible - floating widget replaces sidebar (0698)
  // const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
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
  /** Diagnostics modal (0781). */
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false)
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
        onDiagnosticsClick={() => setDiagnosticsOpen(true)}
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
              />
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

      {/* Diagnostics Modal (0781) */}
      <DiagnosticsModal
        connectedGithubRepo={connectedGithubRepo}
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        supabaseUrl={supabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        openaiApiKey={process.env.VITE_OPENAI_API_KEY || null}
      />
    </div>
  )
}

export default App

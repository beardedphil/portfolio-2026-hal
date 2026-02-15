import React, { useState, useCallback, useRef, useEffect } from 'react'
import { getSupabaseClient } from './lib/supabase'
import * as Kanban from 'portfolio-2026-kanban'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow, KanbanBoardProps } from 'portfolio-2026-kanban'
import 'portfolio-2026-kanban/style.css'
import { AgentInstructionsViewer } from './AgentInstructionsViewer'

const KanbanBoard = Kanban.default
const _kanbanBuild = (Kanban as unknown as { KANBAN_BUILD?: string }).KANBAN_BUILD
const KANBAN_BUILD: string = typeof _kanbanBuild === 'string' ? _kanbanBuild : 'unknown'

/** Artifact row shape (matches Kanban package KanbanAgentArtifactRow). HAL owns DB so we type locally. */
type ArtifactRow = {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

type Agent = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'
type ChatTarget = Agent

type ImageAttachment = {
  file: File
  dataUrl: string // base64 data URL for preview
  filename: string
}

type Message = {
  id: number
  agent: Agent | 'user' | 'system'
  content: string
  timestamp: Date
  imageAttachments?: ImageAttachment[] // Optional array of image attachments
  /** Full prompt text sent to LLM for this message (0202) - only for assistant messages */
  promptText?: string
}

// Conversation instance with unique ID (0070)
type Conversation = {
  id: string // e.g., "implementation-agent-1", "qa-agent-2"
  agentRole: Agent // The agent role this conversation belongs to
  instanceNumber: number // 1, 2, 3, etc.
  messages: Message[]
  createdAt: Date
  oldestLoadedSequence?: number // Track oldest message sequence loaded (for pagination)
  hasMoreMessages?: boolean // Whether there are more messages to load
}

type ToolCallRecord = {
  name: string
  input: unknown
  output: unknown
}

type TicketCreationResult = {
  id: string
  filename: string
  filePath: string
  syncSuccess: boolean
  syncError?: string
  /** True when create_ticket retried due to id/filename collision (0023). */
  retried?: boolean
  attempts?: number
  /** True when ticket was automatically moved to To Do (0083). */
  movedToTodo?: boolean
  /** Error message if auto-move to To Do failed (0083). */
  moveError?: string
  /** True if ticket is ready to start (0083). */
  ready?: boolean
  /** Missing items if ticket is not ready (0083). */
  missingItems?: string[]
  /** True if ticket was auto-fixed (formatting issues resolved) (0095). */
  autoFixed?: boolean
}

type PmAgentResponse = {
  reply: string
  toolCalls: ToolCallRecord[]
  outboundRequest: object | null
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  /** When create_ticket succeeded: id, file path, sync status (0011). */
  ticketCreationResult?: TicketCreationResult
  /** True when create_ticket was available for this request (Supabase creds sent). */
  createTicketAvailable?: boolean
  /** Runner implementation label for diagnostics (e.g. "v2 (shared)"). */
  agentRunner?: string
  /** Full prompt text sent to LLM for this message (0202) - only for assistant messages */
  promptText?: string
}

type DiagnosticsInfo = {
  kanbanRenderMode: string
  selectedChatTarget: ChatTarget
  pmImplementationSource: 'hal-agents' | 'inline'
  lastAgentError: string | null
  lastError: string | null
  openaiLastStatus: string | null
  openaiLastError: string | null
  kanbanLoaded: boolean
  kanbanUrl: string
  /** Kanban library build id (e.g. git commit); confirms which bundle is loaded. */
  kanbanBuild: string
  connectedProject: string | null
  lastPmOutboundRequest: object | null
  lastPmToolCalls: ToolCallRecord[] | null
  lastTicketCreationResult: TicketCreationResult | null
  lastCreateTicketAvailable: boolean | null
  persistenceError: string | null
  pmLastResponseId: string | null
  previousResponseIdInLastRequest: boolean
  /** Agent runner label from last PM response (e.g. "v2 (shared)"). */
  agentRunner: string | null
  /** Auto-move diagnostics entries (0061). */
  autoMoveDiagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>
  /** Current theme and source (0078). */
  theme: Theme
  themeSource: 'default' | 'saved'
  /** Last send payload summary (0077). */
  lastSendPayloadSummary: string | null
  /** True when GitHub repo is connected; enables PM agent read_file/search_files via GitHub API. */
  repoInspectionAvailable: boolean
  /** Unit tests configuration status (0548). */
  unitTestsConfigured: boolean
}

type GithubAuthMe = {
  authenticated: boolean
  login: string | null
  scope: string | null
}

type GithubRepo = {
  id: number
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
}

type ConnectedGithubRepo = {
  fullName: string
  defaultBranch: string
  htmlUrl: string
  private: boolean
}

// localStorage helpers for conversation persistence (fallback when no project DB)
const CONVERSATION_STORAGE_PREFIX = 'hal-chat-conversations-'
/** Cap on character count for recent conversation so long technical messages don't dominate (~3k tokens). */
const CONVERSATION_RECENT_MAX_CHARS = 12_000

// PM_AGENT_ID kept for reference but conversation IDs are used now (0124)
// const PM_AGENT_ID = 'project-manager'

function getStorageKey(projectName: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${projectName}`
}

type SerializedImageAttachment = Omit<ImageAttachment, 'file'> // File objects can't be serialized
type SerializedMessage = Omit<Message, 'timestamp' | 'imageAttachments'> & { 
  timestamp: string
  imageAttachments?: SerializedImageAttachment[]
}
type SerializedConversation = Omit<Conversation, 'messages' | 'createdAt'> & {
  messages: SerializedMessage[]
  createdAt: string
}

// Generate conversation ID for an agent role and instance number (0070)
function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

// Parse conversation ID to get agent role and instance number (0070)
function parseConversationId(conversationId: string): { agentRole: Agent; instanceNumber: number } | null {
  const match = conversationId.match(/^(project-manager|implementation-agent|qa-agent|process-review-agent)-(\d+)$/)
  if (!match) return null
  return {
    agentRole: match[1] as Agent,
    instanceNumber: parseInt(match[2], 10),
  }
}

// Get next instance number for an agent role (0070)
function getNextInstanceNumber(conversations: Map<string, Conversation>, agentRole: Agent): number {
  let maxNumber = 0
  for (const conv of conversations.values()) {
    if (conv.agentRole === agentRole && conv.instanceNumber > maxNumber) {
      maxNumber = conv.instanceNumber
    }
  }
  return maxNumber + 1
}

function saveConversationsToStorage(
  projectName: string,
  conversations: Map<string, Conversation>
): { success: boolean; error?: string } {
  try {
    const serialized: SerializedConversation[] = []
    for (const conv of conversations.values()) {
      serialized.push({
        id: conv.id,
        agentRole: conv.agentRole,
        instanceNumber: conv.instanceNumber,
        createdAt: conv.createdAt.toISOString(),
        messages: conv.messages.map((msg) => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
          imageAttachments: msg.imageAttachments?.map((img) => ({
            dataUrl: img.dataUrl,
            filename: img.filename,
          })),
        })),
      })
    }
    localStorage.setItem(getStorageKey(projectName), JSON.stringify(serialized))
    return { success: true }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Failed to save conversations: ${errMsg}` }
  }
}

function loadConversationsFromStorage(
  projectName: string
): { success: boolean; conversations?: Map<string, Conversation>; error?: string } {
  try {
    const stored = localStorage.getItem(getStorageKey(projectName))
    if (!stored) {
      return { success: true, conversations: new Map() }
    }
    const serialized = JSON.parse(stored) as SerializedConversation[]
    const conversations = new Map<string, Conversation>()
    for (const ser of serialized) {
      conversations.set(ser.id, {
        id: ser.id,
        agentRole: ser.agentRole,
        instanceNumber: ser.instanceNumber,
        createdAt: new Date(ser.createdAt),
        messages: ser.messages.map((msg) => ({
          id: msg.id,
          agent: msg.agent,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          ...(msg.promptText && { promptText: msg.promptText }),
          // imageAttachments from serialized data don't have File objects, so omit them
          // File objects can't be restored from localStorage
        })),
      })
    }
    return { success: true, conversations }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Failed to load conversations: ${errMsg}` }
  }
}

function getEmptyConversations(): Map<string, Conversation> {
  return new Map()
}

const CHAT_OPTIONS: { id: ChatTarget; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent' },
  { id: 'qa-agent', label: 'QA' },
  { id: 'process-review-agent', label: 'Process Review' },
]
// DEBUG: QA option should be visible
console.log('CHAT_OPTIONS:', CHAT_OPTIONS.map(o => o.label))

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getMessageAuthorLabel(agent: Message['agent']): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent' || agent === 'process-review-agent') return 'HAL'
  return 'System'
}

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'hal-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light' // default
}

function App() {
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget>('project-manager')
  // Selected conversation ID (0070) - null means showing conversation list
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  // Chat open state (0087) - when a chat is open, it replaces the Kanban iframe
  const [openChatTarget, setOpenChatTarget] = useState<ChatTarget | string | null>(null) // string = conversation ID
  // Collapsible group states (0087)
  const [qaGroupExpanded, setQaGroupExpanded] = useState(false)
  const [implGroupExpanded, setImplGroupExpanded] = useState(false)
  const [processReviewGroupExpanded, setProcessReviewGroupExpanded] = useState(false)
  const [conversations, setConversations] = useState<Map<string, Conversation>>(getEmptyConversations)
  const [inputValue, setInputValue] = useState('')
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [sendValidationError, setSendValidationError] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [openaiLastStatus, setOpenaiLastStatus] = useState<string | null>(null)
  const [openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [connectedProject, setConnectedProject] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [lastPmOutboundRequest, setLastPmOutboundRequest] = useState<object | null>(null)
  const [lastPmToolCalls, setLastPmToolCalls] = useState<ToolCallRecord[] | null>(null)
  const [lastTicketCreationResult, setLastTicketCreationResult] = useState<TicketCreationResult | null>(null)
  const [lastCreateTicketAvailable, setLastCreateTicketAvailable] = useState<boolean | null>(null)
  const [pmLastResponseId, setPmLastResponseId] = useState<string | null>(null)
  const [agentRunner, setAgentRunner] = useState<string | null>(null)
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null)
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string | null>(null)
  const [lastSendPayloadSummary, setLastSendPayloadSummary] = useState<string | null>(null)
  const [githubAuth, setGithubAuth] = useState<GithubAuthMe | null>(null)
  const [githubRepos, setGithubRepos] = useState<GithubRepo[] | null>(null)
  const [githubRepoPickerOpen, setGithubRepoPickerOpen] = useState(false)
  const [githubRepoQuery, setGithubRepoQuery] = useState('')
  const [connectedGithubRepo, setConnectedGithubRepo] = useState<ConnectedGithubRepo | null>(null)
  const [githubConnectError, setGithubConnectError] = useState<string | null>(null)
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false)
  const [agentInstructionsOpen, setAgentInstructionsOpen] = useState(false)
  const [promptModalMessage, setPromptModalMessage] = useState<Message | null>(null)
  /** Working memory for PM conversation (0173) */
  const [pmWorkingMemory, setPmWorkingMemory] = useState<{
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
  const [pmWorkingMemoryOpen, setPmWorkingMemoryOpen] = useState(false)
  const [pmWorkingMemoryLoading, setPmWorkingMemoryLoading] = useState(false)
  const [pmWorkingMemoryError, setPmWorkingMemoryError] = useState<string | null>(null)
  
  // Alias workingMemory to pmWorkingMemory for UI compatibility (declared early so it can be used in useEffects)
  const workingMemory = pmWorkingMemory ? {
    summary: pmWorkingMemory.summary,
    goals: pmWorkingMemory.goals,
    requirements: pmWorkingMemory.requirements,
    constraints: pmWorkingMemory.constraints,
    decisions: pmWorkingMemory.decisions,
    assumptions: pmWorkingMemory.assumptions,
    openQuestions: pmWorkingMemory.open_questions,
    glossary: pmWorkingMemory.glossary,
    stakeholders: pmWorkingMemory.stakeholders,
    lastUpdatedAt: pmWorkingMemory.updated_at,
  } : null
  const workingMemoryOpen = pmWorkingMemoryOpen
  const workingMemoryLoading = pmWorkingMemoryLoading
  const workingMemoryError = pmWorkingMemoryError
  const setWorkingMemoryOpen = setPmWorkingMemoryOpen
  
  const disconnectConfirmButtonRef = useRef<HTMLButtonElement>(null)
  const disconnectButtonRef = useRef<HTMLButtonElement>(null)
  /** Kanban data (HAL owns DB; fetches and passes to KanbanBoard). */
  const [kanbanTickets, setKanbanTickets] = useState<KanbanTicketRow[]>([])
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnRow[]>([])
  const [kanbanAgentRunsByTicketPk, setKanbanAgentRunsByTicketPk] = useState<Record<string, KanbanAgentRunRow>>({})
  /** Realtime connection status for Kanban board (0140). */
  const [kanbanRealtimeStatus, setKanbanRealtimeStatus] = useState<'connected' | 'disconnected' | 'polling'>('disconnected')
  /** Error message for ticket move operations (0155). */
  const [kanbanMoveError, setKanbanMoveError] = useState<string | null>(null)
  /** Timestamp of last realtime update to prevent polling from overwriting recent updates (0140). */
  const lastRealtimeUpdateRef = useRef<number>(0)
  /** Track subscription status for realtime channels (0140). */
  const realtimeSubscriptionsRef = useRef<{ tickets: boolean; agentRuns: boolean }>({ tickets: false, agentRuns: false })
  const [outboundRequestExpanded, setOutboundRequestExpanded] = useState(false)
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false)
  const messageIdRef = useRef(0)
  const pmMaxSequenceRef = useRef(0) // Keep for backward compatibility during migration
  // Track max sequence per agent instance (e.g., "project-manager-1", "implementation-agent-2")
  const agentSequenceRefs = useRef<Map<string, number>>(new Map())
  const transcriptRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState<string | null>(null) // conversationId loading older messages
  const MESSAGES_PER_PAGE = 50 // Number of messages to load per page
  const selectedChatTargetRef = useRef<ChatTarget>(selectedChatTarget)
  
  // Load working memory when PM chat is selected and project is connected (0173) - moved after fetchPmWorkingMemory definition
  
  const [unreadByTarget, setUnreadByTarget] = useState<Record<ChatTarget, number>>(() => ({
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
    | 'completed'
    | 'failed'
  >('idle')
  /** QA Agent run status for on-screen timeline. */
  const [processReviewStatus, setProcessReviewStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [processReviewTicketPk, setProcessReviewTicketPk] = useState<string | null>(null)
  const [processReviewMessage, setProcessReviewMessage] = useState<string | null>(null)
  const [qaAgentRunStatus, setQaAgentRunStatus] = useState<
    | 'idle'
    | 'preparing'
    | 'fetching_ticket'
    | 'fetching_branch'
    | 'launching'
    | 'polling'
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
  /** Auto-move diagnostics entries (0061). */
  const [autoMoveDiagnostics, setAutoMoveDiagnostics] = useState<Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>>([])
  /** Agent type that initiated the current Cursor run (0067). Used to route completion summaries to the correct chat. */
  const [cursorRunAgentType, setCursorRunAgentType] = useState<Agent | null>(null)
  /** Raw completion summary for troubleshooting when agent type is missing (0067). */
  const [orphanedCompletionSummary, setOrphanedCompletionSummary] = useState<string | null>(null)
  /** Chat region width for resizable divider (0060). */
  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hal-chat-width')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 800) return parsed
      }
    } catch {
      // ignore localStorage errors
    }
    return 400 // default width
  })
  /** Whether chat is collapsed (0160). */
  const [chatCollapsed, setChatCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('hal-chat-collapsed')
      if (saved) {
        return saved === 'true'
      }
    } catch {
      // ignore localStorage errors
    }
    return false // default to expanded
  })
  /** Whether the divider is currently being dragged (0060). */
  const [isDragging, setIsDragging] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)
  /** Animation frame ID for smooth resizing (0076). */
  const rafIdRef = useRef<number | null>(null)
  /** Current mouse position during drag (0076). */
  const mouseXRef = useRef<number | null>(null)

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
    // Close prompt modal when switching away from Project Manager (0202)
    if (selectedChatTarget !== 'project-manager') {
      setPromptModalMessage(null)
    }
  }, [selectedChatTarget])

  // Apply theme to document root on mount and when theme changes (0078)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Persist theme to localStorage (0078)
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore localStorage errors
    }
  }, [theme])

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
          setConnectedProject(parsed.fullName)
          // Conversations will be loaded by the useEffect that watches connectedProject (0124)
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

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
            setConnectedProject(null)
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
          setConnectedProject(null)
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

  // Redirect if Standup chat is accessed (0154: Standup removed)
  useEffect(() => {
    // Handle legacy 'standup' references (e.g., from old localStorage or direct state manipulation)
    // openChatTarget can be a string (conversation ID) or ChatTarget, so check if it's the legacy 'standup' string
    if (openChatTarget === 'standup') {
      // Redirect to Project Manager (sensible default)
      setOpenChatTarget('project-manager')
      setSelectedChatTarget('project-manager')
      setSelectedConversationId(null)
    }
  }, [openChatTarget])

  // Auto-load working memory when PM chat opens (0173) - moved after loadWorkingMemory definition

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

  // Load conversations for a project (0124: extracted to be reusable for page refresh)
  const loadConversationsForProject = useCallback(async (projectName: string) => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

    // If Supabase isn't set yet, use Vercel-provided VITE_ env as default (hosted path)
    if ((!supabaseUrl || !supabaseAnonKey) && url && key) {
      setSupabaseUrl(url)
      setSupabaseAnonKey(key)
    }

    // Load conversations from localStorage first (synchronously) to show them immediately after reconnect (0097: fix empty PM chat)
    // Then load from Supabase asynchronously and merge/overwrite with Supabase data (Supabase takes precedence)
    const loadResult = loadConversationsFromStorage(projectName)
    const restoredConversations = loadResult.conversations || new Map<string, Conversation>()
    // Ensure PM conversation exists even if no messages were loaded (0097: fix empty PM chat after reconnect)
    const pmConvId = getConversationId('project-manager', 1)
    if (!restoredConversations.has(pmConvId)) {
      restoredConversations.set(pmConvId, {
        id: pmConvId,
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
    }
    // Set conversations immediately from localStorage so they're visible right away
    setConversations(restoredConversations)
    if (loadResult.error) {
      setPersistenceError(loadResult.error)
    } else {
      setPersistenceError(null)
    }

    // If Supabase is available, load from Supabase asynchronously and merge/overwrite localStorage data
    if (url && key) {
      ;(async () => {
        try {
          const supabase = getSupabaseClient(url, key)
          // Load ALL conversations from Supabase (not just PM) (0124)
          // Load only the most recent messages per conversation for initial load (pagination)
          // Get distinct agents first
          const { data: agentRows } = await supabase
            .from('hal_conversation_messages')
            .select('agent')
            .eq('project_id', projectName)
            .order('agent', { ascending: true })
          
          const uniqueAgents = [...new Set((agentRows || []).map(r => r.agent as string))]
          
          // For each agent, load only the most recent MESSAGES_PER_PAGE messages
          const allRows: Array<{ agent: string; role: string; content: string; sequence: number; created_at: string; images?: unknown }> = []
          for (const agentId of uniqueAgents) {
            const { data: agentMessages, error: agentError } = await supabase
              .from('hal_conversation_messages')
              .select('agent, role, content, sequence, created_at, images')
              .eq('project_id', projectName)
              .eq('agent', agentId)
              .order('sequence', { ascending: false })
              .limit(MESSAGES_PER_PAGE)
            
            if (!agentError && agentMessages) {
              // Reverse to get chronological order (oldest to newest)
              allRows.push(...agentMessages.reverse())
            }
          }
          
          const rows = allRows
          const error = null // We handle errors per agent above
          
          if (error) {
            console.error('[HAL] Failed to load conversations from Supabase:', error)
            // Keep localStorage conversations (already set above)
            return
          }

          // Group messages by agent (conversation ID format: "agent-role-instanceNumber")
          const conversationsByAgent = new Map<string, { messages: Message[]; createdAt: Date }>()
          let maxMessageId = 0

          if (rows && rows.length > 0) {
            for (const row of rows) {
              const agentId = row.agent as string // e.g., "project-manager-1", "implementation-agent-2"
              const parsed = parseConversationId(agentId)
              
              if (!parsed) {
                // Legacy format: just agent role (e.g., "project-manager") - treat as instance 1
                // Extract agent role from the agent field
                const agentRole = (row.agent as string).split('-')[0] as Agent || 'project-manager'
                const legacyAgentId = `${agentRole}-1`
                if (!conversationsByAgent.has(legacyAgentId)) {
                  conversationsByAgent.set(legacyAgentId, { messages: [], createdAt: new Date() })
                }
                const conv = conversationsByAgent.get(legacyAgentId)!
                const msgId = row.sequence as number
                maxMessageId = Math.max(maxMessageId, msgId)
                conv.messages.push({
                  id: msgId,
                  agent: row.role === 'user' ? 'user' : agentRole,
                  content: row.content ?? '',
                  timestamp: row.created_at ? new Date(row.created_at) : new Date(),
                  // Note: Image attachments from DB don't have File objects, so we omit them
                  // File objects can't be serialized/restored from Supabase
                  imageAttachments: undefined,
                })
                if (conv.messages.length === 1 || (row.created_at && new Date(row.created_at) < conv.createdAt)) {
                  conv.createdAt = row.created_at ? new Date(row.created_at) : new Date()
                }
              } else {
                // New format: agent-role-instanceNumber
                if (!conversationsByAgent.has(agentId)) {
                  conversationsByAgent.set(agentId, { messages: [], createdAt: new Date() })
                }
                const conv = conversationsByAgent.get(agentId)!
                const msgId = row.sequence as number
                maxMessageId = Math.max(maxMessageId, msgId)
                conv.messages.push({
                  id: msgId,
                  agent: row.role === 'user' ? 'user' : parsed.agentRole,
                  content: row.content ?? '',
                  timestamp: row.created_at ? new Date(row.created_at) : new Date(),
                  // Note: Image attachments from DB don't have File objects, so we omit them
                  // File objects can't be serialized/restored from Supabase
                  imageAttachments: undefined,
                })
                if (conv.messages.length === 1 || (row.created_at && new Date(row.created_at) < conv.createdAt)) {
                  conv.createdAt = row.created_at ? new Date(row.created_at) : new Date()
                }
              }
            }
          }

          // Build Conversation objects and track max sequences
          const loadedConversations = new Map<string, Conversation>()
          for (const [agentId, { messages, createdAt }] of conversationsByAgent.entries()) {
            const parsed = parseConversationId(agentId)
            const sortedMessages = messages.sort((a, b) => a.id - b.id) // Ensure chronological order
            const minSeq = sortedMessages.length > 0 ? Math.min(...sortedMessages.map(m => m.id)) : undefined
            const maxSeq = sortedMessages.length > 0 ? Math.max(...sortedMessages.map(m => m.id)) : 0
            
            // Check if there are more messages to load (if we loaded exactly MESSAGES_PER_PAGE, there might be more)
            const hasMore = messages.length >= MESSAGES_PER_PAGE
            
            if (parsed) {
              agentSequenceRefs.current.set(agentId, maxSeq)
              
              // Backward compatibility: update pmMaxSequenceRef for PM conversations
              if (parsed.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                pmMaxSequenceRef.current = maxSeq
              }
              
              loadedConversations.set(agentId, {
                id: agentId,
                agentRole: parsed.agentRole,
                instanceNumber: parsed.instanceNumber,
                messages: sortedMessages,
                createdAt,
                oldestLoadedSequence: minSeq,
                hasMoreMessages: hasMore,
              })
            } else {
              // Legacy format: treat as instance 1
              const agentRole = agentId.split('-')[0] as Agent
              const legacyId = `${agentRole}-1`
              agentSequenceRefs.current.set(legacyId, maxSeq)
              
              if (agentRole === 'project-manager') {
                pmMaxSequenceRef.current = maxSeq
              }
              
              loadedConversations.set(legacyId, {
                id: legacyId,
                agentRole,
                instanceNumber: 1,
                messages: sortedMessages,
                createdAt,
                oldestLoadedSequence: minSeq,
                hasMoreMessages: hasMore,
              })
            }
          }

          // Merge Supabase conversations with localStorage conversations (Supabase takes precedence)
          // This ensures we have all conversations (from localStorage) but with latest data from Supabase
          const mergedConversations = new Map<string, Conversation>(restoredConversations)
          for (const [convId, supabaseConv] of loadedConversations.entries()) {
            mergedConversations.set(convId, supabaseConv)
          }

          // Ensure PM conversation exists even if no messages were loaded (0124: fix PM chat clearing on refresh)
          const pmConvId = getConversationId('project-manager', 1)
          if (!mergedConversations.has(pmConvId)) {
            mergedConversations.set(pmConvId, {
              id: pmConvId,
              agentRole: 'project-manager',
              instanceNumber: 1,
              messages: [],
              createdAt: new Date(),
            })
          }

          messageIdRef.current = maxMessageId
          setConversations(mergedConversations)
          setPersistenceError(null)
        } catch (err) {
          console.error('[HAL] Error loading conversations from Supabase:', err)
          // Keep localStorage conversations (already set above)
        }
      })()
    }
  }, [supabaseUrl, supabaseAnonKey])

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

  // Auto-expand QA, Implementation, and Process Review groups when conversations are restored after reconnect (0097, 0111)
  useEffect(() => {
    if (!connectedProject) return
    // Check if there are any QA, Implementation, or Process Review conversations
    const hasQaConversations = Array.from(conversations.values()).some(conv => conv.agentRole === 'qa-agent')
    const hasImplConversations = Array.from(conversations.values()).some(conv => conv.agentRole === 'implementation-agent')
    const hasProcessReviewConversations = Array.from(conversations.values()).some(conv => conv.agentRole === 'process-review-agent')
    // Auto-expand groups if they have conversations (makes restored chats visible immediately)
    if (hasQaConversations) {
      setQaGroupExpanded(true)
    }
    if (hasImplConversations) {
      setImplGroupExpanded(true)
    }
    if (hasProcessReviewConversations) {
      setProcessReviewGroupExpanded(true)
    }
  }, [connectedProject, conversations])

  // Persist chat width to localStorage (0060)
  useEffect(() => {
    try {
      localStorage.setItem('hal-chat-width', String(chatWidth))
    } catch {
      // ignore localStorage errors
    }
  }, [chatWidth])

  // Persist chat collapsed state to localStorage (0160)
  useEffect(() => {
    try {
      localStorage.setItem('hal-chat-collapsed', String(chatCollapsed))
    } catch {
      // ignore localStorage errors
    }
  }, [chatCollapsed])

  // Handle divider drag with smooth animation (0076)
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    mouseXRef.current = e.clientX
  }, [])

  // Smooth resize using requestAnimationFrame (0076)
  useEffect(() => {
    if (!isDragging) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      return
    }

    const updateWidth = () => {
      if (mouseXRef.current === null) return
      
      const mainElement = document.querySelector('.hal-main')
      if (!mainElement) return
      
      const mainRect = mainElement.getBoundingClientRect()
      // Calculate chat width: distance from mouse (divider center) to right edge
      // Divider is 4px wide, so chat starts at mouseX + 2px (half divider width)
      const newWidth = mainRect.right - mouseXRef.current - 2
      // Clamp between min and max widths
      const clampedWidth = Math.max(320, Math.min(800, newWidth))
      setChatWidth(clampedWidth)
      
      // Schedule next update
      rafIdRef.current = requestAnimationFrame(updateWidth)
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Update mouse position immediately for smooth tracking
      mouseXRef.current = e.clientX
      // Start animation loop if not already running
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(updateWidth)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      mouseXRef.current = null
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }

    // Start animation loop immediately
    rafIdRef.current = requestAnimationFrame(updateWidth)
    
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [isDragging])

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
      if (savedStatus && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'polling', 'completed', 'failed'].includes(savedStatus)) {
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
      if (savedStatus && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(savedStatus)) {
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

  // Get conversations for a specific agent role (0070)
  const getConversationsForAgent = useCallback((agentRole: Agent): Conversation[] => {
    const result: Conversation[] = []
    for (const conv of conversations.values()) {
      if (conv.agentRole === agentRole) {
        result.push(conv)
      }
    }
    // Sort by instance number (ascending)
    result.sort((a, b) => a.instanceNumber - b.instanceNumber)
    return result
  }, [conversations])

  // Get conversation label (e.g., "Implementation #1", "QA #2") (0070)
  const getConversationLabel = useCallback((conv: Conversation): string => {
    const roleLabels: Record<Agent, string> = {
      'project-manager': 'Project Manager',
      'implementation-agent': 'Implementation',
      'qa-agent': 'QA',
      'process-review-agent': 'Process Review',
    }
    return `${roleLabels[conv.agentRole]} #${conv.instanceNumber}`
  }, [])

  // Get preview text from last message (first line, max 100 chars) (0070)
  const getConversationPreview = useCallback((conv: Conversation): string => {
    if (conv.messages.length === 0) return 'No messages yet'
    const lastMsg = conv.messages[conv.messages.length - 1]
    const firstLine = lastMsg.content.split('\n')[0]
    return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine
  }, [])

  // Get preview text for PM chat (0087)
  const getChatTargetPreview = useCallback((target: ChatTarget): string => {
    if (target === 'project-manager') {
      const defaultConvId = getConversationId('project-manager', 1)
      if (conversations.has(defaultConvId)) {
        const conv = conversations.get(defaultConvId)!
        return getConversationPreview(conv)
      }
    }
    return 'No messages yet'
  }, [conversations, getConversationPreview])

  // Format ticket ID as HAL-XXXX (0098)
  const formatTicketId = useCallback((ticketId: string | null): string => {
    if (!ticketId) return 'No ticket'
    // Ensure ticket ID is 4 digits, pad with zeros if needed
    const padded = ticketId.padStart(4, '0')
    return `HAL-${padded}`
  }, [])

  // Fetch working memory for current PM conversation (0173) — use API only so we never hit Supabase from client (avoids 406)
  const fetchWorkingMemory = useCallback(async () => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
      setPmWorkingMemory(null)
      return
    }
    if (selectedChatTarget !== 'project-manager') {
      setPmWorkingMemory(null)
      return
    }
    const convId = selectedConversationId || getConversationId('project-manager', 1)
    setPmWorkingMemoryLoading(true)
    setPmWorkingMemoryError(null)
    try {
      const res = await fetch('/api/conversations/working-memory/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: connectedProject,
          agent: convId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPmWorkingMemory(null)
        if (data.error) setPmWorkingMemoryError(data.error)
        return
      }
      const wm = data.workingMemory
      if (wm) {
        const arr = (x: unknown) => (Array.isArray(x) ? x : typeof x === 'string' ? (x ? [x] : []) : [])
        setPmWorkingMemory({
          summary: wm.summary || '',
          goals: arr(wm.goals),
          requirements: arr(wm.requirements),
          constraints: arr(wm.constraints),
          decisions: arr(wm.decisions),
          assumptions: arr(wm.assumptions),
          open_questions: arr(wm.openQuestions ?? wm.open_questions),
          glossary: typeof wm.glossary === 'object' && wm.glossary !== null ? (wm.glossary as Record<string, string>) : {},
          stakeholders: arr(wm.stakeholders),
          updated_at: wm.lastUpdatedAt || wm.last_updated_at || new Date().toISOString(),
          through_sequence: typeof wm.throughSequence === 'number' ? wm.throughSequence : 0,
        })
      } else {
        setPmWorkingMemory(null)
      }
    } catch (err) {
      console.error('[HAL] Failed to fetch working memory:', err)
      setPmWorkingMemoryError(err instanceof Error ? err.message : String(err))
      setPmWorkingMemory(null)
    } finally {
      setPmWorkingMemoryLoading(false)
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey, selectedChatTarget, selectedConversationId])

  // Legacy loadWorkingMemory function for compatibility
  const loadWorkingMemory = useCallback(async () => {
    await fetchWorkingMemory()
  }, [fetchWorkingMemory])

  // Legacy refreshWorkingMemory function - defined after refreshPmWorkingMemory
  const refreshWorkingMemory = useCallback(async () => {
    // refreshPmWorkingMemory will be defined later, so we'll use it directly in the callback
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
      return
    }
    try {
      setPmWorkingMemoryLoading(true)
      const url = supabaseUrl.trim()
      const key = supabaseAnonKey.trim()
      const res = await fetch('/api/pm/working-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: connectedProject,
          supabaseUrl: url,
          supabaseAnonKey: key,
          force: true,
        }),
      })
      const data = await res.json() as { success: boolean; workingMemory?: any; error?: string }
      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh working memory')
      }
      if (data.workingMemory) {
        setPmWorkingMemory({
          summary: data.workingMemory.summary || '',
          goals: Array.isArray(data.workingMemory.goals) ? data.workingMemory.goals : [],
          requirements: Array.isArray(data.workingMemory.requirements) ? data.workingMemory.requirements : [],
          constraints: Array.isArray(data.workingMemory.constraints) ? data.workingMemory.constraints : [],
          decisions: Array.isArray(data.workingMemory.decisions) ? data.workingMemory.decisions : [],
          assumptions: Array.isArray(data.workingMemory.assumptions) ? data.workingMemory.assumptions : [],
          open_questions: Array.isArray(data.workingMemory.openQuestions) ? data.workingMemory.openQuestions : (Array.isArray(data.workingMemory.open_questions) ? data.workingMemory.open_questions : []),
          glossary: data.workingMemory.glossary && typeof data.workingMemory.glossary === 'object' ? data.workingMemory.glossary as Record<string, string> : {},
          stakeholders: Array.isArray(data.workingMemory.stakeholders) ? data.workingMemory.stakeholders : [],
          updated_at: data.workingMemory.updated_at || new Date().toISOString(),
          through_sequence: data.workingMemory.through_sequence || 0,
        })
      } else {
        setPmWorkingMemory(null)
      }
    } catch (err) {
      console.error('[PM] Failed to refresh working memory:', err)
    } finally {
      setPmWorkingMemoryLoading(false)
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey, selectedConversationId])

  // Fetch PM working memory (0173) — use API only so we never hit Supabase from client (avoids 406 on hal_conversation_working_memory)
  const fetchPmWorkingMemory = useCallback(async (conversationId?: string) => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
      setPmWorkingMemory(null)
      return
    }
    const convId = conversationId ?? selectedConversationId ?? getConversationId('project-manager', 1)
    try {
      setPmWorkingMemoryLoading(true)
      setPmWorkingMemoryError(null)
      const res = await fetch('/api/conversations/working-memory/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: connectedProject,
          agent: convId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPmWorkingMemory(null)
        if (data.error) setPmWorkingMemoryError(data.error)
        return
      }
      const wm = data.workingMemory
      if (wm && (wm.summary || (Array.isArray(wm.goals) && wm.goals.length) || (Array.isArray(wm.requirements) && wm.requirements.length))) {
        const arr = (x: unknown) => (Array.isArray(x) ? x : typeof x === 'string' ? (x ? [x] : []) : [])
        setPmWorkingMemory({
          summary: wm.summary || '',
          goals: arr(wm.goals),
          requirements: arr(wm.requirements),
          constraints: arr(wm.constraints),
          decisions: arr(wm.decisions),
          assumptions: arr(wm.assumptions),
          open_questions: arr(wm.openQuestions ?? wm.open_questions),
          glossary: typeof wm.glossary === 'object' && wm.glossary !== null ? (wm.glossary as Record<string, string>) : {},
          stakeholders: arr(wm.stakeholders),
          updated_at: wm.lastUpdatedAt || wm.last_updated_at || new Date().toISOString(),
          through_sequence: typeof wm.throughSequence === 'number' ? wm.throughSequence : wm.through_sequence || 0,
        })
      } else {
        setPmWorkingMemory(null)
      }
    } catch (err) {
      console.error('[PM] Failed to fetch working memory:', err)
      setPmWorkingMemoryError(err instanceof Error ? err.message : String(err))
      setPmWorkingMemory(null)
    } finally {
      setPmWorkingMemoryLoading(false)
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey, selectedConversationId])

  // Fetch working memory when PM conversation changes (0173)
  useEffect(() => {
    if (selectedChatTarget === 'project-manager' && connectedProject && supabaseUrl && supabaseAnonKey) {
      fetchPmWorkingMemory()
    } else {
      setPmWorkingMemory(null)
    }
  }, [selectedChatTarget, selectedConversationId, connectedProject, supabaseUrl, supabaseAnonKey, fetchPmWorkingMemory])

  // Auto-load working memory when PM chat opens (0173)
  useEffect(() => {
    if (openChatTarget === 'project-manager' && connectedProject && supabaseUrl && supabaseAnonKey && workingMemoryOpen) {
      loadWorkingMemory()
    }
  }, [openChatTarget, connectedProject, supabaseUrl, supabaseAnonKey, workingMemoryOpen, loadWorkingMemory])



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
      } catch (err) {
        console.error('[HAL] Error loading older messages:', err)
      } finally {
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

  // Load PM working memory when PM chat is opened (0173)
  useEffect(() => {
    if (selectedChatTarget === 'project-manager' && connectedProject && supabaseUrl && supabaseAnonKey) {
      fetchPmWorkingMemory()
    } else {
      setPmWorkingMemory(null)
    }
  }, [selectedChatTarget, selectedConversationId, connectedProject, supabaseUrl, supabaseAnonKey, fetchPmWorkingMemory])

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
            const messagesToSave = conv.messages.filter(msg => msg.id > currentMaxSeq)
            
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

  /** Extract ticket ID from message content (0061). */
  const extractTicketId = useCallback((content: string): string | null => {
    // Try "Implement ticket XXXX" or "QA ticket XXXX" patterns
    const implMatch = content.match(/implement\s+ticket\s+(\d{4})/i)
    if (implMatch) return implMatch[1]
    const qaMatch = content.match(/qa\s+ticket\s+(\d{4})/i)
    if (qaMatch) return qaMatch[1]
    // Try to find any 4-digit ticket ID in the message
    const anyMatch = content.match(/\b(\d{4})\b/)
    if (anyMatch) return anyMatch[1]
    return null
  }, [])

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
    if (selectedChatTarget === 'process-review-agent' || openChatTarget === 'process-review-agent') {
      // Initialize Process Review Agent conversation if it doesn't exist
      getDefaultConversationId('process-review-agent')
    }
  }, [selectedChatTarget, openChatTarget, getDefaultConversationId])

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


  /** Fetch tickets and columns from Supabase (HAL owns data; passes to KanbanBoard). */
  const fetchKanbanData = useCallback(async (skipIfRecentRealtime = false) => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key || !connectedProject) {
      setKanbanTickets([])
      setKanbanColumns([])
      setKanbanAgentRunsByTicketPk({})
      return
    }
    // Skip polling if realtime is connected and there was a recent update (within 5 seconds)
    // This prevents polling from overwriting realtime updates (0140)
    if (skipIfRecentRealtime && kanbanRealtimeStatus === 'connected') {
      const timeSinceLastRealtimeUpdate = Date.now() - lastRealtimeUpdateRef.current
      if (timeSinceLastRealtimeUpdate < 5000) {
        return
      }
    }
    try {
      const supabase = getSupabaseClient(url, key)
      const { data: ticketRows } = await supabase
        .from('tickets')
        .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .eq('repo_full_name', connectedProject)
        .order('ticket_number', { ascending: true })
      const { data: colRows } = await supabase
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
      const { data: runRows } = await supabase
        .from('hal_agent_runs')
        .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, status, created_at, updated_at')
        .eq('repo_full_name', connectedProject)

      setKanbanTickets((ticketRows ?? []) as KanbanTicketRow[])
      const canonicalColumnOrder = [
        'col-unassigned',
        'col-todo',
        'col-doing',
        'col-qa',
        'col-human-in-the-loop',
        'col-process-review',
        'col-done',
        'col-wont-implement',
      ] as const
      const raw = (colRows ?? []) as KanbanColumnRow[]
      const seen = new Set<string>()
      const columns = raw.filter((c) => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        return true
      })
      const order = canonicalColumnOrder as unknown as string[]
      const sorted = [...columns].sort((a, b) => {
        const ia = order.indexOf(a.id)
        const ib = order.indexOf(b.id)
        if (ia === -1 && ib === -1) return 0
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      const withTitles = sorted.map((c) =>
        c.id === 'col-qa' ? { ...c, title: 'Ready for QA' } : c
      )
      setKanbanColumns(withTitles)
      const byPk: Record<string, KanbanAgentRunRow> = {}
      for (const r of (runRows ?? []) as KanbanAgentRunRow[]) {
        if (r.ticket_pk) byPk[r.ticket_pk] = r
      }
      setKanbanAgentRunsByTicketPk(byPk)
      // Removed automatic unassigned check (0161) - now only runs via explicit user action
    } catch {
      setKanbanTickets([])
      setKanbanColumns([])
      setKanbanAgentRunsByTicketPk({})
    }
  }, [supabaseUrl, supabaseAnonKey, connectedProject, kanbanRealtimeStatus])

  useEffect(() => {
    fetchKanbanData()
  }, [fetchKanbanData])

  // Polling fallback: only run when realtime is disconnected (0140)
  const KANBAN_POLL_MS = 10_000
  useEffect(() => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) return
    // Only poll when realtime is not connected (fallback mode)
    // Polling should run when status is 'disconnected' OR 'polling', but not when 'connected'
    if (kanbanRealtimeStatus === 'connected') return
    const id = setInterval(() => fetchKanbanData(true), KANBAN_POLL_MS)
    return () => clearInterval(id)
  }, [connectedProject, supabaseUrl, supabaseAnonKey, fetchKanbanData, kanbanRealtimeStatus])

  // Supabase Realtime subscriptions for live updates (0140)
  useEffect(() => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key || !connectedProject) {
      setKanbanRealtimeStatus('disconnected')
      return
    }

    const supabase = getSupabaseClient(url, key)
    const subscriptions: Array<{ unsubscribe: () => void }> = []
    realtimeSubscriptionsRef.current = { tickets: false, agentRuns: false }

    // Helper to update connection status based on subscription state
    const updateConnectionStatus = () => {
      const { tickets, agentRuns } = realtimeSubscriptionsRef.current
      if (tickets && agentRuns) {
        setKanbanRealtimeStatus('connected')
      } else if (!tickets && !agentRuns) {
        setKanbanRealtimeStatus('disconnected')
      } else {
        // One subscription failed, fall back to polling
        setKanbanRealtimeStatus('polling')
      }
    }

    // Subscribe to tickets table changes
    const ticketsChannel = supabase
      .channel(`kanban-tickets-${connectedProject}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          // Filter by repo_full_name in callback since postgres_changes filter may not support column filters
          const ticket = (payload.new || payload.old) as KanbanTicketRow | { pk: string; repo_full_name?: string }
          if (ticket.repo_full_name !== connectedProject) return

          // Track realtime update timestamp to prevent polling from overwriting (0140)
          lastRealtimeUpdateRef.current = Date.now()

          if (payload.eventType === 'INSERT' && payload.new) {
            const newTicket = payload.new as KanbanTicketRow
            setKanbanTickets((prev) => {
              // Prevent duplicates by checking if ticket already exists
              if (prev.some((t) => t.pk === newTicket.pk)) return prev
              return [...prev, newTicket].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedTicket = payload.new as KanbanTicketRow
            setKanbanTickets((prev) => {
              // Replace ticket by pk to prevent duplicates
              const filtered = prev.filter((t) => t.pk !== updatedTicket.pk)
              return [...filtered, updatedTicket].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
            })
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedTicket = payload.old as { pk: string }
            setKanbanTickets((prev) => prev.filter((t) => t.pk !== deletedTicket.pk))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[HAL] Realtime: Subscribed to tickets changes')
          realtimeSubscriptionsRef.current.tickets = true
          updateConnectionStatus()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[HAL] Realtime: Tickets subscription error, falling back to polling')
          realtimeSubscriptionsRef.current.tickets = false
          updateConnectionStatus()
        }
      })

    subscriptions.push({ unsubscribe: () => ticketsChannel.unsubscribe() })

    // Subscribe to agent runs table changes
    const agentRunsChannel = supabase
      .channel(`kanban-agent-runs-${connectedProject}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hal_agent_runs',
        },
        (payload) => {
          // Filter by repo_full_name in callback
          const run = (payload.new || payload.old) as KanbanAgentRunRow | { repo_full_name?: string; ticket_pk?: string }
          if (run.repo_full_name !== connectedProject) return

          // Track realtime update timestamp (0140)
          lastRealtimeUpdateRef.current = Date.now()

          if (payload.eventType === 'INSERT' && payload.new) {
            const newRun = payload.new as KanbanAgentRunRow
            const ticketPk = newRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => ({
                ...prev,
                [ticketPk]: newRun,
              }))
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedRun = payload.new as KanbanAgentRunRow
            const ticketPk = updatedRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => ({
                ...prev,
                [ticketPk]: updatedRun,
              }))
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedRun = payload.old as { ticket_pk?: string }
            if (deletedRun.ticket_pk) {
              setKanbanAgentRunsByTicketPk((prev) => {
                const next = { ...prev }
                delete next[deletedRun.ticket_pk!]
                return next
              })
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[HAL] Realtime: Subscribed to agent runs changes')
          realtimeSubscriptionsRef.current.agentRuns = true
          updateConnectionStatus()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[HAL] Realtime: Agent runs subscription error, falling back to polling')
          realtimeSubscriptionsRef.current.agentRuns = false
          updateConnectionStatus()
        }
      })

    subscriptions.push({ unsubscribe: () => agentRunsChannel.unsubscribe() })

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe())
      setKanbanRealtimeStatus('disconnected')
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey])

  const handleKanbanMoveTicket = useCallback(
    async (ticketPk: string, columnId: string, position?: number) => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) {
        setKanbanMoveError('Cannot move ticket: Supabase credentials not configured')
        setTimeout(() => setKanbanMoveError(null), 5000)
        return
      }

      // Find the ticket to get its current state for optimistic update
      const ticket = kanbanTickets.find((t) => t.pk === ticketPk)
      if (!ticket) {
        setKanbanMoveError('Cannot move ticket: Ticket not found')
        setTimeout(() => setKanbanMoveError(null), 5000)
        return
      }

      // Store original state for rollback on error
      const originalColumnId = ticket.kanban_column_id
      const originalPosition = ticket.kanban_position
      const movedAt = new Date().toISOString()

      // Optimistically update UI immediately (0155)
      setKanbanTickets((prev) => {
        const updated = prev.map((t) =>
          t.pk === ticketPk
            ? {
                ...t,
                kanban_column_id: columnId,
                kanban_position: position ?? 0,
                kanban_moved_at: movedAt,
              }
            : t
        )
        return updated.sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
      })
      setKanbanMoveError(null) // Clear any previous error

      try {
        const supabase = getSupabaseClient(url, key)
        const { error } = await supabase
          .from('tickets')
          .update({
            kanban_column_id: columnId,
            kanban_position: position ?? 0,
            kanban_moved_at: movedAt,
          })
          .eq('pk', ticketPk)

        if (error) {
          throw error
        }

        // Clear Process Review banner when moving a ticket to Process Review column
        // (unless it's the ticket currently being reviewed)
        if (columnId === 'col-process-review' && processReviewTicketPk !== ticketPk) {
          setProcessReviewStatus('idle')
          setProcessReviewMessage(null)
          // Don't clear processReviewTicketPk if a review is running for a different ticket
          // (let it finish and auto-clear after 5 seconds)
        }

        // Refresh data to ensure consistency (realtime will also update, but this ensures sync)
        // Use skipIfRecentRealtime to avoid overwriting realtime updates (0140)
        await fetchKanbanData(true)
      } catch (err) {
        // Revert optimistic update on error (0155)
        setKanbanTickets((prev) => {
          const reverted = prev.map((t) =>
            t.pk === ticketPk
              ? {
                  ...t,
                  kanban_column_id: originalColumnId,
                  kanban_position: originalPosition,
                  kanban_moved_at: ticket.kanban_moved_at,
                }
              : t
          )
          return reverted.sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
        })

        // Show user-visible error (0155)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setKanbanMoveError(`Failed to move ticket: ${errorMsg}`)
        setTimeout(() => setKanbanMoveError(null), 8000) // Auto-clear after 8 seconds
      }
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData, processReviewTicketPk, kanbanTickets]
  )

  const handleKanbanReorderColumn = useCallback(
    async (_columnId: string, orderedTicketPks: string[]) => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return
      const supabase = getSupabaseClient(url, key)
      for (let i = 0; i < orderedTicketPks.length; i++) {
        await supabase.from('tickets').update({ kanban_position: i }).eq('pk', orderedTicketPks[i])
      }
      await fetchKanbanData()
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData]
  )

  const handleKanbanUpdateTicketBody = useCallback(
    async (ticketPk: string, bodyMd: string) => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return
      const supabase = getSupabaseClient(url, key)
      await supabase.from('tickets').update({ body_md: bodyMd }).eq('pk', ticketPk)
      await fetchKanbanData()
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData]
  )

  /** Clear/delete a conversation from Supabase and local state (0124) */
  const clearConversation = useCallback(
    async (conversationId: string) => {
      if (!connectedProject) return

      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

      // Delete from Supabase if connected
      if (url && key) {
        try {
          const supabase = getSupabaseClient(url, key)
          const { error } = await supabase
            .from('hal_conversation_messages')
            .delete()
            .eq('project_id', connectedProject)
            .eq('agent', conversationId)
          
          if (error) {
            console.error('[HAL] Failed to delete conversation from Supabase:', error)
            setPersistenceError(`Failed to clear conversation: ${error.message}`)
            return
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[HAL] Error clearing conversation:', err)
          setPersistenceError(`Failed to clear conversation: ${errMsg}`)
          return
        }
      }

      // Clear from local state
      setConversations((prev) => {
        const next = new Map(prev)
        next.delete(conversationId)
        return next
      })

      // Reset sequence tracking for this conversation
      agentSequenceRefs.current.delete(conversationId)

      // If this was the currently open conversation, close it or switch to default
      const parsed = parseConversationId(conversationId)
      if (parsed) {
        if (openChatTarget === conversationId) {
          setOpenChatTarget(null)
        }
        if (selectedConversationId === conversationId) {
          setSelectedConversationId(null)
        }
      }

      setPersistenceError(null)
    },
    [connectedProject, supabaseUrl, supabaseAnonKey, openChatTarget, selectedConversationId]
  )

  /** Fetch artifacts for a ticket (same Supabase as tickets). Used by Kanban when opening ticket detail. */
  const fetchArtifactsForTicket = useCallback(
    async (ticketPk: string): Promise<ArtifactRow[]> => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return []
      const trySyncAndUseResponse = async (): Promise<ArtifactRow[]> => {
        try {
          const syncRes = await fetch('/api/agent-runs/sync-artifacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ticketPk }),
          })
          const syncJson = (await syncRes.json().catch(() => ({}))) as { artifacts?: ArtifactRow[] }
          if (Array.isArray(syncJson.artifacts) && syncJson.artifacts.length > 0) return syncJson.artifacts
        } catch (e) {
          console.warn('[HAL] fetchArtifactsForTicket sync:', e)
        }
        return []
      }
      try {
        const supabase = getSupabaseClient(url, key)
        const { data, error } = await supabase
          .from('agent_artifacts')
          .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
          .eq('ticket_pk', ticketPk)
          .order('created_at', { ascending: true })
          .order('artifact_id', { ascending: true })
        if (error) {
          console.warn('[HAL] fetchArtifactsForTicket:', error.message)
          return trySyncAndUseResponse()
        }
        let list = (data ?? []) as ArtifactRow[]
        if (list.length === 0) {
          const fromSync = await trySyncAndUseResponse()
          if (fromSync.length > 0) return fromSync
          const { data: data2 } = await supabase
            .from('agent_artifacts')
            .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
            .eq('ticket_pk', ticketPk)
            .order('created_at', { ascending: true })
            .order('artifact_id', { ascending: true })
          list = (data2 ?? []) as ArtifactRow[]
        }
        return list
      } catch (e) {
        console.warn('[HAL] fetchArtifactsForTicket:', e)
        return []
      }
    },
    [supabaseUrl, supabaseAnonKey]
  )

  /** Trigger agent run for a given message and target (used by handleSend and HAL_OPEN_CHAT_AND_SEND) */
  const triggerAgentRun = useCallback(
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
            
            let body: { message: string; conversationHistory?: Array<{ role: string; content: string }>; previous_response_id?: string; projectId?: string; repoFullName?: string; supabaseUrl?: string; supabaseAnonKey?: string; conversationId?: string; images?: Array<{ dataUrl: string; filename: string; mimeType: string }> } = { message: content }
            if (pmLastResponseId) body.previous_response_id = pmLastResponseId
            if (connectedProject) body.projectId = connectedProject
            if (connectedGithubRepo?.fullName) body.repoFullName = connectedGithubRepo.fullName
            // Send conversationId for working memory (0173)
            body.conversationId = convId
            // Always send Supabase creds when we have them so create_ticket is available (0011)
            // Use url/key from state or env (0119: fix Supabase credentials not being sent)
            if (url && key) {
              body.supabaseUrl = url
              body.supabaseAnonKey = key
            }
            // Include image attachments if present
            if (imageAttachments && imageAttachments.length > 0) {
              body.images = imageAttachments.map((img) => ({
                dataUrl: img.dataUrl,
                filename: img.filename,
                mimeType: img.file.type,
              }))
            }

            // Add user message to UI (only once, before DB insert to avoid duplicates) (0119)
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
            } else {
              const pmConv = conversations.get(convId)
              const pmMessages = pmConv?.messages ?? []
              const turns = pmMessages.map((msg) => ({
                role: msg.agent === 'user' ? ('user' as const) : ('assistant' as const),
                content: msg.content,
              }))
              let recentLen = 0
              const recentTurns: typeof turns = []
              for (let i = turns.length - 1; i >= 0; i--) {
                const t = turns[i]
                const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
                if (recentLen + lineLen > CONVERSATION_RECENT_MAX_CHARS && recentTurns.length > 0) break
                recentTurns.unshift(t)
                recentLen += lineLen
              }
              body.conversationHistory = recentTurns
            }

            // Debug: log what we're sending (0119) - use console.warn for visibility
            console.warn('[PM] Sending request to /api/pm/respond:', {
              hasRepoFullName: !!body.repoFullName,
              repoFullName: body.repoFullName || 'NOT SET',
              hasProjectId: !!body.projectId,
              projectId: body.projectId || 'NOT SET',
              hasSupabaseUrl: !!body.supabaseUrl,
              hasSupabaseAnonKey: !!body.supabaseAnonKey,
              connectedGithubRepo: connectedGithubRepo?.fullName || 'NOT SET',
            })
            // Client-side timeout (75s) so user gets feedback if server hangs; Vercel times out at 60s
            const PM_FETCH_TIMEOUT_MS = 75_000
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), PM_FETCH_TIMEOUT_MS)
            let res: Response
            try {
              res = await fetch('/api/pm/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Include session cookie so GitHub token is available (0119: fix PM agent repo selection)
                body: JSON.stringify(body),
                signal: controller.signal,
              })
            } catch (fetchErr) {
              clearTimeout(timeoutId)
              if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
                setAgentTypingTarget(null)
                const timeoutMsg = 'Request timed out. The PM agent may need more time—try a simpler request or break bulk moves into smaller batches (e.g. "Continue" for the next 5).'
                setOpenaiLastError(timeoutMsg)
                setLastAgentError('Request timed out')
                addMessage(convId, 'project-manager', `[PM] Error: ${timeoutMsg}`)
                return
              }
              throw fetchErr
            }
            clearTimeout(timeoutId)
            setOpenaiLastStatus(String(res.status))
            const text = await res.text()

            // 504 = gateway timeout: server took too long; response body is HTML, not JSON
            if (res.status === 504) {
              setAgentTypingTarget(null)
              const timeoutMsg = 'Request timed out (504). The PM agent may need more time for this task—try breaking it into smaller steps or a simpler request.'
              setOpenaiLastError(timeoutMsg)
              setLastAgentError('504 Gateway Timeout')
              addMessage(convId, 'project-manager', `[PM] Error: ${timeoutMsg}`)
              return
            }
            
            let data: PmAgentResponse & { _debug?: { repoFullName?: string; hasGithubToken?: boolean; hasGithubReadFile?: boolean; hasGithubSearchCode?: boolean; cookieHeaderPresent?: boolean; repoUsage?: Array<{ tool: string; usedGitHub: boolean; path?: string }> } }
            try {
              data = JSON.parse(text) as typeof data
              // Log debug info from server (0119)
              if (data._debug) {
                console.warn('[PM] Server response debug info:', data._debug)
                if (data._debug.repoUsage && data._debug.repoUsage.length > 0) {
                  console.warn('[PM] Repo usage:', data._debug.repoUsage)
                  const usedGitHub = data._debug.repoUsage.some(r => r.usedGitHub)
                  const usedHAL = data._debug.repoUsage.some(r => !r.usedGitHub)
                  if (usedHAL) {
                    console.warn('[PM] ⚠️ PM agent used HAL repo instead of GitHub repo!', data._debug.repoUsage.filter(r => !r.usedGitHub))
                  } else if (usedGitHub) {
                    console.warn('[PM] ✅ PM agent used GitHub repo correctly')
                  }
                } else if (data.toolCalls && data.toolCalls.length > 0) {
                  console.warn('[PM] Tool calls made but no repo usage tracked. Tools:', data.toolCalls.map(t => t.name))
                }
              }
            } catch {
              setAgentTypingTarget(null)
              const parseErr = res.status >= 500
                ? `Server error (${res.status}). The response was not valid JSON—this often happens when the request times out or the server crashes.`
                : `Invalid response format (HTTP ${res.status}). Expected JSON from the PM endpoint.`
              setOpenaiLastError(parseErr)
              setLastAgentError('Invalid response format')
              addMessage(convId, 'project-manager', `[PM] Error: ${parseErr}`)
              return
            }

            // Store diagnostics data
            setLastPmOutboundRequest(data.outboundRequest)
            setLastPmToolCalls(data.toolCalls?.length ? data.toolCalls : null)
            setLastTicketCreationResult(data.ticketCreationResult ?? null)
            setLastCreateTicketAvailable(data.createTicketAvailable ?? null)
            setAgentRunner(data.agentRunner ?? null)

            if (!res.ok || data.error) {
              setAgentTypingTarget(null)
              const errMsg = data.error ?? `HTTP ${res.status}`
              setOpenaiLastError(errMsg)
              setLastAgentError(errMsg)
              // Still show reply if available, otherwise show error
              const displayMsg = data.reply || `[PM] Error: ${errMsg}`
              addMessage(convId, 'project-manager', displayMsg)
              return
            }

            setOpenaiLastError(null)
            setLastAgentError(null)
            if (data.responseId != null) setPmLastResponseId(data.responseId)

            // When reply is empty but a ticket was just created, show ticket creation summary (0011, 0083, 0095)
            let reply = data.reply || ''
            if (!reply.trim() && data.ticketCreationResult) {
              const t = data.ticketCreationResult
              const autoFixNote = t.autoFixed ? ' (formatting issues were automatically fixed)' : ''
              if (t.movedToTodo) {
                reply = t.syncSuccess
                  ? `Created ticket **${t.id}** at \`${t.filePath}\`. The ticket is **Ready-to-start**${autoFixNote} and has been automatically moved to **To Do**.`
                  : `Created ticket **${t.id}** at \`${t.filePath}\`. The ticket is **Ready-to-start**${autoFixNote} and has been automatically moved to **To Do**. Sync to repo failed: ${t.syncError ?? 'unknown'}. You can run \`npm run sync-tickets\` from the repo root.`
              } else if (t.moveError) {
                reply = `Created ticket **${t.id}** at \`${t.filePath}\`. The ticket is **Ready-to-start**${autoFixNote} but could not be moved to To Do: ${t.moveError}. It remains in Unassigned. Please try moving it manually or check the error details.`
              } else if (t.ready === false && t.missingItems && t.missingItems.length > 0) {
                reply = `Created ticket **${t.id}** at \`${t.filePath}\`. The ticket is **not Ready-to-start**: ${t.missingItems.join('; ')}. It remains in Unassigned. Please update the ticket content to make it ready, then use "Prepare top ticket" or ask me to move it to To Do.`
              } else {
                reply = t.syncSuccess
                  ? `Created ticket **${t.id}** at \`${t.filePath}\`. It should appear in Unassigned.`
                  : `Created ticket **${t.id}** at \`${t.filePath}\`. Sync to repo failed: ${t.syncError ?? 'unknown'}. You can run \`npm run sync-tickets\` from the repo root.`
              }
            }
            if (!reply.trim()) {
              reply =
                data.createTicketAvailable === false
                  ? '[PM] (No response). Create ticket was not available for this request—ensure the project is connected and .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then try again.'
                  : '[PM] (No response). Check whether create_ticket was available and any tool calls were made.'
            }
            setAgentTypingTarget(null)
            if (useDb && supabaseUrl && supabaseAnonKey && connectedProject) {
              const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
              const nextSeq = currentMaxSeq + 1
              const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)
              await supabase.from('hal_conversation_messages').insert({
                project_id: connectedProject,
                agent: convId, // Use conversation ID (e.g., "project-manager-1") (0124)
                role: 'assistant',
                content: reply,
                sequence: nextSeq,
              })
              agentSequenceRefs.current.set(convId, nextSeq)
              // Backward compatibility: update pmMaxSequenceRef for PM conversations
              const parsed = parseConversationId(convId)
              if (parsed && parsed.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                pmMaxSequenceRef.current = nextSeq
              }
              addMessage(convId, 'project-manager', reply, nextSeq, undefined, data.promptText)
            } else {
              addMessage(convId, 'project-manager', reply, undefined, undefined, data.promptText)
            }
            
            // Refresh working memory after PM agent responds (0173)
            if (connectedProject && supabaseUrl && supabaseAnonKey) {
              // Refresh working memory in the background (non-blocking)
              fetchPmWorkingMemory().catch((err) => {
                console.warn('[PM] Failed to refresh working memory after response:', err)
              })
            }
            
            // If a ticket was just created, immediately refresh Kanban data (0133)
            // Error is non-blocking: if refresh fails, normal polling will pick up the new ticket within 10s
            if (data.ticketCreationResult) {
              fetchKanbanData().catch((err) => {
                console.warn('[HAL] Failed to refresh Kanban after ticket creation (non-blocking):', err)
                // Continue normal polling; ticket will appear on next poll cycle
              })
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
              let data: { status?: string; cursor_status?: string; error?: string; summary?: string; pr_url?: string }
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
              const cursorStatus = String(data.cursor_status ?? '')
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
              setImplAgentRunStatus('polling')
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
              let data: { status?: string; cursor_status?: string; error?: string; summary?: string }
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
              const cursorStatus = String(data.cursor_status ?? '')
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
              setQaAgentRunStatus('polling')
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
      pmLastResponseId,
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

  // Track most recent work button click event for diagnostics (0072)
  const [lastWorkButtonClick, setLastWorkButtonClick] = useState<{ eventId: string; timestamp: Date; chatTarget: ChatTarget; message: string } | null>(null)

  /** Kanban work button: open chat and send message. When ticketPk + implementation-agent, move ticket to Doing first. */
  const handleKanbanOpenChatAndSend = useCallback(
    async (data: { chatTarget: ChatTarget; message: string; ticketPk?: string }) => {
      if (!data.chatTarget || !data.message) return
      const eventId = `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setLastWorkButtonClick({ eventId, timestamp: new Date(), chatTarget: data.chatTarget, message: data.message })
      setSelectedChatTarget(data.chatTarget)
      let conversationId: string | undefined
      if (data.chatTarget === 'implementation-agent' || data.chatTarget === 'qa-agent' || data.chatTarget === 'process-review-agent') {
        conversationId = getOrCreateConversation(data.chatTarget)
        setSelectedConversationId(conversationId)
      } else {
        conversationId = getDefaultConversationId('project-manager')
      }
      if (data.ticketPk && data.chatTarget === 'implementation-agent') {
        const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
        await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
      }
      // QA Top Ticket: move from QA column to Active Work (col-doing) when QA button clicked (0159)
      if (data.ticketPk && data.chatTarget === 'qa-agent') {
        const ticket = kanbanTickets.find((t) => t.pk === data.ticketPk)
        if (ticket && ticket.kanban_column_id === 'col-qa') {
          const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
          await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
        }
      }
      triggerAgentRun(data.message, data.chatTarget, undefined, conversationId)
    },
    [triggerAgentRun, getOrCreateConversation, getDefaultConversationId, kanbanTickets, handleKanbanMoveTicket]
  )

  /** Process Review button: trigger Process Review agent for top ticket in Process Review column. */
  const handleKanbanProcessReview = useCallback(
    async (data: { ticketPk: string; ticketId?: string }) => {
      if (!data.ticketPk) return
      
      // Get or create Process Review conversation
      const convId = getOrCreateConversation('process-review-agent')
      setSelectedChatTarget('process-review-agent')
      setSelectedConversationId(convId)
      
      // Move ticket to Active Work (col-doing) when Process Review starts (0167)
      const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
      try {
        await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
      } catch (moveError) {
        console.error('Failed to move ticket to Active Work:', moveError)
        // Continue with Process Review even if move fails
      }
      
      // Set status to running (for both Kanban banner and chat UI)
      setProcessReviewStatus('running')
      setProcessReviewTicketPk(data.ticketPk)
      setProcessReviewMessage(`Process Review started for ticket ${data.ticketId || data.ticketPk}`)
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
      addProgress('Fetching ticket and artifacts...')
      setProcessReviewAgentRunStatus('running')

      try {
        const response = await fetch('/api/process-review/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk: data.ticketPk,
            ticketId: data.ticketId,
            supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? undefined,
            supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? undefined,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setProcessReviewStatus('failed')
          setProcessReviewAgentRunStatus('failed')
          const errorMsg = result.error || 'Unknown error'
          setProcessReviewMessage(`Process Review failed: ${errorMsg}`)
          setProcessReviewAgentError(errorMsg)
          addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
          return
        }

        // Success - Process Review completed, show recommendations in modal (0484)
        const suggestionCount = result.suggestions?.length || 0
        const reviewId = result.reviewId || null
        
        if (suggestionCount > 0 && result.suggestions) {
          // Show recommendations in modal instead of auto-creating tickets (0484)
          const recommendations = result.suggestions.map((s: { text: string; justification: string }, idx: number) => ({
            text: s.text,
            justification: s.justification,
            id: `rec-${Date.now()}-${idx}`, // Unique ID for tracking
            error: undefined,
            isCreating: false,
          }))
          
          setProcessReviewRecommendations(recommendations)
          setProcessReviewModalTicketPk(data.ticketPk)
          setProcessReviewModalTicketId(data.ticketId || null)
          setProcessReviewModalReviewId(reviewId)
          
          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. ${suggestionCount} recommendation${suggestionCount !== 1 ? 's' : ''} ready for review.`
          setProcessReviewMessage(successMsg)
          addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}\n\nReview the recommendations in the modal and click "Implement" to create tickets.`)
        } else {
          // No suggestions - mark as completed
          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. No recommendations found.`
          setProcessReviewMessage(successMsg)
          addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}`)
          
          // Move Process Review ticket to Done after completion (0167)
          const doneCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-done').length
          await handleKanbanMoveTicket(data.ticketPk, 'col-done', doneCount)
          addProgress('Process Review ticket moved to Done')
          
          // Reset after 5 seconds (Kanban banner only)
          setTimeout(() => {
            setProcessReviewStatus('idle')
            setProcessReviewMessage(null)
            setProcessReviewTicketPk(null)
          }, 5000)
        }
      } catch (err) {
        setProcessReviewStatus('failed')
        setProcessReviewAgentRunStatus('failed')
        const errorMsg = err instanceof Error ? err.message : String(err)
        setProcessReviewMessage(`Process Review failed: ${errorMsg}`)
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

  const handleSend = useCallback(() => {
    const content = inputValue.trim()
    
    // Clear previous validation error
    setSendValidationError(null)
    
    // Validate: must have either text or image
    if (!content && !imageAttachment) {
      setSendValidationError('Please enter a message or attach an image before sending.')
      return
    }

    // Don't send if there's an image error
    if (imageError) {
      setSendValidationError('Please fix the image error before sending.')
      return
    }

    // Get or create conversation ID for the selected chat target (0070)
    let convId: string
    if (selectedConversationId && conversations.has(selectedConversationId)) {
      convId = selectedConversationId
    } else {
      convId = getDefaultConversationId(selectedChatTarget === 'project-manager' ? 'project-manager' : selectedChatTarget)
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
    // But actually, triggerAgentRun handles PM agent messages, so we should let it handle all messages
    // to avoid duplicates. The deduplication in addMessage will catch any edge cases.
    if (selectedChatTarget !== 'project-manager') {
      addMessage(convId, 'user', content, undefined, attachments)
    }
    setInputValue('')
    setImageAttachment(null)
    setImageError(null)
    setSendValidationError(null)
    setLastAgentError(null)

    // Use the extracted triggerAgentRun function
    triggerAgentRun(content, selectedChatTarget, attachments, convId)
  }, [inputValue, selectedChatTarget, selectedConversationId, conversations, addMessage, supabaseUrl, supabaseAnonKey, connectedProject, triggerAgentRun, getDefaultConversationId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  /** Send "Continue" to PM for multi-batch bulk operations (e.g. move all tickets). */
  const handleContinueBatch = useCallback(() => {
    const convId =
      selectedConversationId && conversations.has(selectedConversationId)
        ? selectedConversationId
        : getDefaultConversationId('project-manager')
    triggerAgentRun('Continue', 'project-manager', undefined, convId)
  }, [selectedConversationId, conversations, getDefaultConversationId, triggerAgentRun])

  const handleThemeToggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])


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
    setPmLastResponseId(null)
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
    // Clear working memory on disconnect (0173)
    setPmWorkingMemory(null)
    setPmWorkingMemoryOpen(false)
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

  const previousResponseIdInLastRequest =
    lastPmOutboundRequest != null &&
    typeof lastPmOutboundRequest === 'object' &&
    'previous_response_id' in lastPmOutboundRequest &&
    (lastPmOutboundRequest as { previous_response_id?: string }).previous_response_id != null

  // Determine theme source (0078)
  const themeSource: 'default' | 'saved' = (() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      return stored === 'light' || stored === 'dark' ? 'saved' : 'default'
    } catch {
      return 'default'
    }
  })()

  const diagnostics: DiagnosticsInfo = {
    kanbanRenderMode: 'library',
    kanbanBuild: KANBAN_BUILD,
    selectedChatTarget,
    pmImplementationSource: selectedChatTarget === 'project-manager' ? 'hal-agents' : 'inline',
    lastAgentError,
    lastError,
    openaiLastStatus,
    openaiLastError,
    kanbanLoaded: true,
    kanbanUrl: 'library',
    connectedProject,
    lastPmOutboundRequest,
    lastPmToolCalls,
    lastTicketCreationResult,
    lastCreateTicketAvailable,
    persistenceError,
    pmLastResponseId,
    previousResponseIdInLastRequest,
    agentRunner,
    autoMoveDiagnostics,
    theme,
    themeSource,
    lastSendPayloadSummary,
    repoInspectionAvailable: !!connectedGithubRepo?.fullName,
    unitTestsConfigured: true,
  }

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
  }

  // Chat panel content (used in sidebar when openChatTarget is set — same structure/classes as right panel for correct styling)
  const chatPanelContent = (function renderChatPanelContent() {
    const displayMessages = activeMessages
    const displayTarget = selectedChatTarget
    const lastMsg = displayMessages[displayMessages.length - 1]
    const showContinueButton =
      displayTarget === 'project-manager' &&
      agentTypingTarget !== 'project-manager' &&
      !!lastMsg &&
      lastMsg.agent === 'project-manager' &&
      lastMsg.content.includes('Reply with **Continue** to move the next batch')
    return (
      <div className="hal-chat-panel-inner" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Agent stub banners and status panels */}
        {displayTarget === 'implementation-agent' && (
          <>
            <div className="agent-stub-banner" role="status">
              <p className="agent-stub-title">Implementation Agent — Cursor Cloud Agents</p>
              <p className="agent-stub-hint">
                {import.meta.env.VITE_CURSOR_API_KEY
                  ? 'Say "Implement ticket XXXX" (e.g. Implement ticket 0046) to fetch the ticket, launch a Cursor cloud agent, and move the ticket to QA when done.'
                  : 'Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable.'}
              </p>
            </div>
            {(implAgentRunStatus !== 'idle' || implAgentError) && (
              <div className="impl-agent-status-panel" role="status" aria-live="polite">
                <div className="impl-agent-status-header">
                  <span className="impl-agent-status-label">Status:</span>
                  <span className={`impl-agent-status-value impl-status-${implAgentRunStatus}`}>
                    {implAgentRunStatus === 'preparing' ? 'Preparing' :
                     implAgentRunStatus === 'fetching_ticket' ? 'Fetching ticket' :
                     implAgentRunStatus === 'resolving_repo' ? 'Resolving repository' :
                     implAgentRunStatus === 'launching' ? 'Launching agent' :
                     implAgentRunStatus === 'polling' ? 'Running agent' :
                     implAgentRunStatus === 'completed' ? 'Done' :
                     implAgentRunStatus === 'failed' ? 'Error' : implAgentRunStatus}
                  </span>
                </div>
                {implAgentError && <div className="impl-agent-error">{implAgentError}</div>}
              </div>
            )}
          </>
        )}
        {displayTarget === 'qa-agent' && (
          <>
            <div className="agent-stub-banner" role="status">
              <p className="agent-stub-title">QA Agent — Cursor Cloud Agents</p>
              <p className="agent-stub-hint">
                {import.meta.env.VITE_CURSOR_API_KEY
                  ? 'Say "QA ticket XXXX" to run QA for a ticket. The agent will run in the cloud and report results here.'
                  : 'Cursor API is not configured.'}
              </p>
            </div>
            {(qaAgentRunStatus !== 'idle' || qaAgentError) && (
              <div className="impl-agent-status-panel" role="status" aria-live="polite">
                <div className="impl-agent-status-header">
                  <span className="impl-agent-status-label">Status:</span>
                  <span className={`impl-agent-status-value impl-status-${qaAgentRunStatus}`}>
                    {qaAgentRunStatus === 'preparing' ? 'Preparing' :
                     qaAgentRunStatus === 'fetching_ticket' ? 'Fetching ticket' :
                     qaAgentRunStatus === 'fetching_branch' ? 'Fetching branch' :
                     qaAgentRunStatus === 'launching' ? 'Launching agent' :
                     qaAgentRunStatus === 'polling' ? 'Running agent' :
                     qaAgentRunStatus === 'generating_report' ? 'Generating report' :
                     qaAgentRunStatus === 'merging' ? 'Merging' :
                     qaAgentRunStatus === 'moving_ticket' ? 'Moving ticket' :
                     qaAgentRunStatus === 'completed' ? 'Done' :
                     qaAgentRunStatus === 'failed' ? 'Error' : qaAgentRunStatus}
                  </span>
                </div>
                {qaAgentError && <div className="impl-agent-error">{qaAgentError}</div>}
              </div>
            )}
          </>
        )}
        {/* Messages list — use chat-transcript so sidebar gets same styles as right panel */}
        <div className="chat-transcript" ref={messagesEndRef}>
          {displayMessages.length === 0 && agentTypingTarget !== displayTarget ? (
            <p className="transcript-empty">
              {displayTarget === 'project-manager'
                ? 'Send a message to the Project Manager to get started.'
                : displayTarget === 'implementation-agent'
                ? 'Ask to implement a ticket (e.g. "Implement ticket 0046").'
                : displayTarget === 'qa-agent'
                ? 'Ask to run QA on a ticket (e.g. "QA ticket 0046").'
                : 'Send a message to start the conversation.'}
            </p>
          ) : (
            <>
              {displayMessages.map((msg) => (
                <div key={msg.id} className={`message-row message-row-${msg.agent}`} data-agent={msg.agent}>
                  <div
                    className={`message message-${msg.agent} ${displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? 'message-clickable' : ''}`}
                    onClick={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? () => setPromptModalMessage(msg) : undefined}
                    style={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? { cursor: 'pointer' } : undefined}
                    title={displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText ? 'Click to view sent prompt' : undefined}
                  >
                    <div className="message-header">
                      <span className="message-author">{getMessageAuthorLabel(msg.agent)}</span>
                      <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                      {displayTarget === 'project-manager' && msg.agent === 'project-manager' && msg.promptText && (
                        <span className="message-prompt-indicator" title="Click to view sent prompt">📋</span>
                      )}
                      {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                        <div className="message-images">
                          {msg.imageAttachments.map((img, idx) => (
                            <div key={idx} className="message-image-container">
                              <img src={img.dataUrl} alt={img.filename} className="message-image-thumbnail" />
                              <span className="message-image-filename">{img.filename}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.content.trimStart().startsWith('{') ? (
                        <pre className="message-content message-json">{msg.content}</pre>
                      ) : (
                        <span className="message-content">{msg.content}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {agentTypingTarget === displayTarget && (
                <div className="message-row message-row-typing" data-agent="typing" aria-live="polite">
                  <div className="message message-typing">
                    <div className="message-header">
                      <span className="message-author">HAL</span>
                    </div>
                    <span className="typing-bubble">
                      <span className="typing-label">Thinking</span>
                      <span className="typing-dots">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {/* Composer — use chat-composer and composer-input-row so sidebar matches right panel */}
        <div className="chat-composer">
          {imageAttachment && (
            <div className="image-attachment-preview">
              <img src={imageAttachment.dataUrl} alt={imageAttachment.filename} className="attachment-thumbnail" />
              <span className="attachment-filename">{imageAttachment.filename}</span>
              <button type="button" className="remove-attachment-btn" onClick={handleRemoveImage} aria-label="Remove attachment">×</button>
            </div>
          )}
          {(imageError || sendValidationError) && (
            <div className="image-error-message" role="alert">{imageError || sendValidationError}</div>
          )}
          <div className="composer-input-row">
            <textarea
              ref={composerRef}
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send)"
              rows={2}
              aria-label="Message input"
            />
            <label className="attach-image-btn" title="Attach image">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
                aria-label="Attach image"
              />
              📎
            </label>
            {showContinueButton && (
              <button type="button" className="continue-batch-btn send-btn" onClick={handleContinueBatch} title="Continue moving the next batch of tickets">
                Continue
              </button>
            )}
            <button type="button" className="send-btn" onClick={handleSend} disabled={!!imageError}>
              Send
            </button>
          </div>
        </div>
      </div>
    )
  })()

  return (
    <div className="hal-app">
      <header className="hal-header">
        <div className="hal-header-left">
          <h1>HAL</h1>
          <span className="hal-subtitle">Agent Workspace</span>
        </div>
        <div className="hal-header-center">
          {!connectedProject ? (
            <button type="button" className="connect-project-btn" onClick={handleGithubConnect}>
              Connect GitHub Repo
            </button>
          ) : (
            <div className="project-info">
              {connectedGithubRepo && (
                <span className="project-name" title={connectedGithubRepo.fullName}>
                  {connectedGithubRepo.fullName}
                </span>
              )}
              <button
                ref={disconnectButtonRef}
                type="button"
                className="disconnect-btn"
                onClick={handleDisconnectClick}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
        <div className="hal-header-actions">
          <button
            type="button"
            className="github-connect"
            onClick={handleGithubConnect}
            title={githubAuth?.authenticated ? 'GitHub connected' : 'Sign in with GitHub'}
          >
            {githubAuth?.authenticated ? `GitHub: ${githubAuth.login ?? 'connected'}` : 'Sign into GitHub'}
          </button>
          {githubAuth?.authenticated && (
            <button type="button" className="github-logout" onClick={handleGithubDisconnect} title="Sign out of GitHub">
              Sign out
            </button>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={handleThemeToggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '🌙' : '☀️'} {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button
            type="button"
            className="agent-instructions-btn"
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
              <button type="button" className="conversation-modal-close" onClick={() => setGithubRepoPickerOpen(false)} aria-label="Close repo picker">
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
              <button type="button" className="conversation-modal-close" onClick={handleDisconnectCancel} aria-label="Close confirmation">
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
                    onClick={handleDisconnectCancel}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--hal-border)',
                      background: 'var(--hal-surface)',
                      color: 'var(--hal-text)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    ref={disconnectConfirmButtonRef}
                    type="button"
                    onClick={handleDisconnectConfirm}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--hal-border)',
                      background: 'var(--hal-danger, #dc3545)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                    }}
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
          {/* Process Review status (0118) */}
          {processReviewMessage && (
            <div
              className={`process-review-status ${processReviewStatus === 'running' ? 'process-review-status-running' : processReviewStatus === 'completed' ? 'process-review-status-completed' : 'process-review-status-failed'}`}
              role="status"
              aria-live="polite"
            >
              {processReviewStatus === 'running' && '⏳ '}
              {processReviewStatus === 'completed' && '✅ '}
              {processReviewStatus === 'failed' && '❌ '}
              {processReviewMessage}
            </div>
          )}
          {/* Chat Window (0087) - overlays Kanban when a chat is open (0096: keep Kanban mounted) */}
          <div className={`chat-window-container ${openChatTarget ? 'chat-window-visible' : 'chat-window-hidden'}`}>
            {openChatTarget && (
              <>
                <div className="chat-window-header">
                  <div className="chat-window-title">
                    {typeof openChatTarget === 'string' && conversations.has(openChatTarget)
                      ? getConversationLabel(conversations.get(openChatTarget)!)
                      : openChatTarget === 'project-manager'
                      ? 'Project Manager'
                      : 'Chat'}
                  </div>
                  <div className="chat-window-actions">
                    {/* Clear conversation button (0124) */}
                    {(() => {
                      const currentConvId = typeof openChatTarget === 'string' && conversations.has(openChatTarget)
                        ? openChatTarget
                        : openChatTarget === 'project-manager'
                        ? getConversationId('project-manager', 1)
                        : null
                      const currentConv = currentConvId ? conversations.get(currentConvId) : null
                      const hasMessages = currentConv && currentConv.messages.length > 0
                      return hasMessages ? (
                        <button
                          type="button"
                          className="chat-window-clear"
                          onClick={async () => {
                            if (currentConvId && window.confirm('Are you sure you want to clear this conversation? This will delete all messages and cannot be undone.')) {
                              await clearConversation(currentConvId)
                            }
                          }}
                          aria-label="Clear conversation"
                          title="Clear conversation"
                        >
                          Clear conversation
                        </button>
                      ) : null
                    })()}
                    <button
                      type="button"
                      className={`chat-window-close ${openChatTarget === 'project-manager' ? 'chat-window-close-pm' : ''}`}
                      onClick={() => {
                        setOpenChatTarget(null)
                      }}
                      aria-label="Close chat"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="chat-window-content">
                  {/* Working Memory Panel (0173) - only for PM agent */}
                  {openChatTarget === 'project-manager' && connectedProject && supabaseUrl && supabaseAnonKey && (
                    <div className={`working-memory-panel ${workingMemoryOpen ? 'working-memory-open' : ''}`}>
                      <div className="working-memory-header">
                        <button
                          type="button"
                          className="working-memory-toggle"
                          onClick={() => {
                            setWorkingMemoryOpen(!workingMemoryOpen)
                            if (!workingMemoryOpen && !workingMemory && !workingMemoryLoading) {
                              loadWorkingMemory()
                            }
                          }}
                          aria-label={workingMemoryOpen ? 'Hide working memory' : 'Show working memory'}
                        >
                          <span className="working-memory-icon">{workingMemoryOpen ? '▼' : '▶'}</span>
                          <span>PM Working Memory</span>
                        </button>
                        {workingMemoryOpen && (
                          <button
                            type="button"
                            className="working-memory-refresh"
                            onClick={() => refreshWorkingMemory()}
                            disabled={workingMemoryLoading}
                            aria-label="Refresh working memory"
                            title="Refresh working memory now"
                          >
                            ↻
                          </button>
                        )}
                      </div>
                      {workingMemoryOpen && (
                        <div className="working-memory-content">
                          {workingMemoryLoading && <div className="working-memory-loading">Loading...</div>}
                          {workingMemoryError && (
                            <div className="working-memory-error" role="alert">
                              Error: {workingMemoryError}
                            </div>
                          )}
                          {!workingMemoryLoading && !workingMemoryError && workingMemory && (
                            <div className="working-memory-body">
                              {workingMemory.lastUpdatedAt && (
                                <div className="working-memory-timestamp">
                                  Last updated: {new Date(workingMemory.lastUpdatedAt).toLocaleString()}
                                </div>
                              )}
                              {workingMemory.summary && (
                                <div className="working-memory-section">
                                  <h4>Summary</h4>
                                  <p>{workingMemory.summary}</p>
                                </div>
                              )}
                              {workingMemory.goals.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Goals</h4>
                                  <ul>
                                    {workingMemory.goals.map((goal, i) => (
                                      <li key={i}>{goal}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.requirements.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Requirements</h4>
                                  <ul>
                                    {workingMemory.requirements.map((req, i) => (
                                      <li key={i}>{req}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.constraints.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Constraints</h4>
                                  <ul>
                                    {workingMemory.constraints.map((constraint, i) => (
                                      <li key={i}>{constraint}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.decisions.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Decisions</h4>
                                  <ul>
                                    {workingMemory.decisions.map((decision, i) => (
                                      <li key={i}>{decision}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.assumptions.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Assumptions</h4>
                                  <ul>
                                    {workingMemory.assumptions.map((assumption, i) => (
                                      <li key={i}>{assumption}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.openQuestions.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Open Questions</h4>
                                  <ul>
                                    {workingMemory.openQuestions.map((question, i) => (
                                      <li key={i}>{question}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workingMemory.stakeholders.length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Stakeholders</h4>
                                  <ul>
                                    {workingMemory.stakeholders.map((stakeholder, i) => (
                                      <li key={i}>{stakeholder}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {Object.keys(workingMemory.glossary).length > 0 && (
                                <div className="working-memory-section">
                                  <h4>Glossary</h4>
                                  <dl>
                                    {Object.entries(workingMemory.glossary).map(([term, def]) => (
                                      <div key={term}>
                                        <dt>{term}</dt>
                                        <dd>{def}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                              )}
                              {!workingMemory.summary &&
                                workingMemory.goals.length === 0 &&
                                workingMemory.requirements.length === 0 &&
                                workingMemory.constraints.length === 0 &&
                                workingMemory.decisions.length === 0 &&
                                workingMemory.assumptions.length === 0 &&
                                workingMemory.openQuestions.length === 0 &&
                                workingMemory.stakeholders.length === 0 &&
                                Object.keys(workingMemory.glossary).length === 0 && (
                                  <div className="working-memory-empty">No working memory data yet. It will be generated automatically as the conversation grows.</div>
                                )}
                            </div>
                          )}
                          {!workingMemoryLoading && !workingMemoryError && !workingMemory && (
                            <div className="working-memory-empty">No working memory found. Click refresh to generate it.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Render the chat UI here - same as the right panel chat */}
                  {chatPanelContent}
                  {/* duplicate chat panel IIFE removed - content is in chatPanelContent */}
                </div>
              </>
            )}
          </div>
          {/* Kanban board (HAL owns data; passes tickets/columns and callbacks). Cast props so fetchArtifactsForTicket is accepted when package types are older (e.g. Vercel cache). */}
          <div className={`kanban-frame-container ${openChatTarget ? 'kanban-frame-hidden' : 'kanban-frame-visible'}`}>
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

        {/* Resizable divider (0060) - hidden when chat is collapsed (0160) */}
        {!chatCollapsed && (
          <div
            ref={dividerRef}
            className={`hal-divider ${isDragging ? 'hal-divider-dragging' : ''}`}
            onMouseDown={handleDividerMouseDown}
            role="separator"
            aria-label="Resize chat and kanban panes"
            aria-orientation="vertical"
          >
            {isDragging && (() => {
              const mainElement = document.querySelector('.hal-main')
              if (!mainElement) return null
              const mainRect = mainElement.getBoundingClientRect()
              const percentage = (chatWidth / mainRect.width) * 100
              return (
                <div className="hal-divider-width-display">
                  {percentage.toFixed(1)}%
                </div>
              )
            })()}
          </div>
        )}

        {/* Right column: Chat UI (0160: hidden when collapsed) */}
        {!chatCollapsed && (
          <section className="hal-chat-region" aria-label="Chat" style={{ width: `${chatWidth}px` }}>
            <div className="chat-header">
              <h2>Chat</h2>
              <button
                type="button"
                className="chat-collapse-btn"
                onClick={() => setChatCollapsed(true)}
                aria-label="Collapse chat"
                title="Collapse chat"
              >
                <span aria-hidden="true">◀</span>
              </button>
            </div>

          {/* Chat Preview Stack (0087) */}
          {connectedProject ? (
            <div className="chat-preview-stack">
              {/* Project Manager */}
              <div
                className={`chat-preview-pane ${openChatTarget === 'project-manager' ? 'chat-preview-active' : ''}`}
                onClick={() => {
                  setOpenChatTarget('project-manager')
                  setSelectedChatTarget('project-manager')
                  setSelectedConversationId(null)
                  setUnreadByTarget((prev) => ({ ...prev, 'project-manager': 0 }))
                }}
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

              {/* Process Review Group */}
              <div className="chat-preview-group">
                <div
                  className="chat-preview-group-header"
                  onClick={() => setProcessReviewGroupExpanded(!processReviewGroupExpanded)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setProcessReviewGroupExpanded(!processReviewGroupExpanded)
                    }
                  }}
                >
                  <span className="chat-preview-group-icon">{processReviewGroupExpanded ? '▼' : '▶'}</span>
                  <span className="chat-preview-name">Process Review</span>
                  {unreadByTarget['process-review-agent'] > 0 && (
                    <span className="chat-preview-unread">{unreadByTarget['process-review-agent']}</span>
                  )}
                </div>
                {processReviewGroupExpanded && (
                  <div className="chat-preview-group-items">
                    {getConversationsForAgent('process-review-agent').length === 0 ? (
                      <div className="chat-preview-empty">No Process Review agents running</div>
                    ) : (
                      getConversationsForAgent('process-review-agent').map((conv) => (
                        <div
                          key={conv.id}
                          className={`chat-preview-pane chat-preview-nested ${openChatTarget === conv.id ? 'chat-preview-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenChatTarget(conv.id)
                            setSelectedChatTarget('process-review-agent')
                            setSelectedConversationId(conv.id)
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setOpenChatTarget(conv.id)
                              setSelectedChatTarget('process-review-agent')
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

          {/* Configuration Status Panel (0042) - Hidden per ticket 0105, code kept intact */}
          {false && (
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
          )}

          {/* Diagnostics panel - Hidden per ticket 0105, code kept intact */}
          {false && (
            <div className="diagnostics-section">
            <button
              type="button"
              className="diagnostics-toggle"
              onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
              aria-expanded={diagnosticsOpen}
            >
              Diagnostics {diagnosticsOpen ? '▼' : '▶'}
            </button>
            
            {/* Working Memory Panel (0173) */}
            {selectedChatTarget === 'project-manager' && (
              <button
                type="button"
                className="diagnostics-toggle"
                onClick={() => {
                  setWorkingMemoryOpen(!workingMemoryOpen)
                  if (!workingMemoryOpen && !workingMemory && !workingMemoryLoading) {
                    fetchWorkingMemory()
                  }
                }}
                aria-expanded={workingMemoryOpen}
              >
                PM Working Memory {workingMemoryOpen ? '▼' : '▶'}
              </button>
            )}
            
            {workingMemoryOpen && selectedChatTarget === 'project-manager' && (
              <div className="diagnostics-panel" role="region" aria-label="PM Working Memory">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>PM Working Memory</h3>
                  <button
                    type="button"
                    onClick={refreshWorkingMemory}
                    disabled={workingMemoryLoading}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      cursor: workingMemoryLoading ? 'not-allowed' : 'pointer',
                      opacity: workingMemoryLoading ? 0.6 : 1,
                    }}
                  >
                    {workingMemoryLoading ? 'Refreshing...' : 'Refresh now'}
                  </button>
                </div>
                
                {workingMemoryError && (
                  <div style={{ color: '#d32f2f', marginBottom: '12px', fontSize: '12px' }}>
                    Error: {workingMemoryError}
                    <br />
                    <span style={{ fontSize: '11px', fontStyle: 'italic' }}>
                      PM agent will continue using recent messages only.
                    </span>
                  </div>
                )}
                
                {workingMemoryLoading && !workingMemory && (
                  <div style={{ color: '#666', fontSize: '12px' }}>Loading working memory...</div>
                )}
                
                {!workingMemoryLoading && !workingMemory && !workingMemoryError && (
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    No working memory available yet. Start a conversation to build working memory.
                    <br />
                    <span style={{ fontSize: '11px', fontStyle: 'italic' }}>
                      PM agent will use recent messages only until working memory is generated.
                    </span>
                  </div>
                )}
                
                {workingMemory && (() => {
                  const wm = workingMemory!
                  return (
                    <div style={{ fontSize: '12px' }}>
                      <div style={{ marginBottom: '8px', color: '#666' }}>
                        Last updated: {new Date(wm.lastUpdatedAt).toLocaleString()}
                      </div>
                      
                      {wm.summary && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Summary</div>
                          <div style={{ color: '#333', lineHeight: '1.5' }}>{wm.summary}</div>
                        </div>
                      )}
                      
                      {wm.goals.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Goals</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.goals.map((goal, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{goal}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.requirements.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Requirements</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.requirements.map((req, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.constraints.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Constraints</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.constraints.map((constraint, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{constraint}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.decisions.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Decisions</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.decisions.map((decision, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{decision}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.assumptions.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Assumptions</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.assumptions.map((assumption, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{assumption}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.openQuestions && wm.openQuestions.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Open Questions</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.openQuestions.map((question, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{question}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {Object.keys(wm.glossary).length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Glossary</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {Object.entries(wm.glossary).map(([term, def]) => (
                              <li key={term} style={{ marginBottom: '4px' }}>
                                <strong>{term}:</strong> {def}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {wm.stakeholders.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Stakeholders</div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                            {wm.stakeholders.map((stakeholder, idx) => (
                              <li key={idx} style={{ marginBottom: '4px' }}>{stakeholder}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
            
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
                      const mainRect = mainElement!.getBoundingClientRect()
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
                  <span className="diag-label">Kanban build:</span>
                  <span className="diag-value" title="Library build id; inspect data-kanban-build on board root to confirm.">
                    {diagnostics.kanbanBuild}
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
                      {lastWorkButtonClick!.eventId} ({lastWorkButtonClick!.timestamp.toLocaleTimeString()})
                      <br />
                      <span style={{ fontSize: '0.9em', color: '#666' }}>
                        Target: {lastWorkButtonClick!.chatTarget}
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
                <div className="diag-row">
                  <span className="diag-label">Unit tests:</span>
                  <span className="diag-value" data-status={diagnostics.unitTestsConfigured ? 'ok' : 'error'}>
                    {diagnostics.unitTestsConfigured ? 'configured (Vitest)' : 'not configured'}
                  </span>
                </div>
                {diagnostics.unitTestsConfigured && (
                  <div className="diag-row" style={{ fontSize: '0.9em', color: '#666', fontStyle: 'italic', marginTop: '-8px', marginBottom: '8px' }}>
                    <span className="diag-label" style={{ visibility: 'hidden' }}>Unit tests:</span>
                    <span className="diag-value">This project is set up for unit tests to keep refactors safe.</span>
                  </div>
                )}
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
                        {diagnostics.lastPmToolCalls && diagnostics.lastPmToolCalls!.length > 0 ? (
                          <ul className="diag-tool-calls">
                            {diagnostics.lastPmToolCalls!.map((call, idx) => (
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

                {/* PM Working Memory (0173) */}
                {selectedChatTarget === 'project-manager' && (
                  <div className="diag-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="diag-section-toggle"
                        onClick={() => setPmWorkingMemoryOpen(!pmWorkingMemoryOpen)}
                        aria-expanded={workingMemoryOpen}
                      >
                        PM Working Memory {workingMemoryOpen ? '▼' : '▶'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
                            // Project not connected - working memory unavailable
                            return
                          }
                          setPmWorkingMemoryLoading(true)
                          try {
                            const baseUrl = (await fetch('/.hal/api-base-url').then(r => r.text())).trim() || window.location.origin
                            // Trigger refresh (this will cause the PM agent to update working memory on next message)
                            // For now, just reload the current working memory
                            const res = await fetch(`${baseUrl}/api/pm/working-memory?projectId=${encodeURIComponent(connectedProject)}&agent=project-manager`)
                            const data = await res.json()
                            if (data.success) {
                              if (data.workingMemory) {
                                setPmWorkingMemory({
                                  summary: data.workingMemory.summary || '',
                                  goals: Array.isArray(data.workingMemory.goals) ? data.workingMemory.goals : [],
                                  requirements: Array.isArray(data.workingMemory.requirements) ? data.workingMemory.requirements : [],
                                  constraints: Array.isArray(data.workingMemory.constraints) ? data.workingMemory.constraints : [],
                                  decisions: Array.isArray(data.workingMemory.decisions) ? data.workingMemory.decisions : [],
                                  assumptions: Array.isArray(data.workingMemory.assumptions) ? data.workingMemory.assumptions : [],
                                  open_questions: Array.isArray(data.workingMemory.openQuestions) ? data.workingMemory.openQuestions : (Array.isArray(data.workingMemory.open_questions) ? data.workingMemory.open_questions : []),
                                  glossary: data.workingMemory.glossary && typeof data.workingMemory.glossary === 'object' ? data.workingMemory.glossary as Record<string, string> : {},
                                  stakeholders: Array.isArray(data.workingMemory.stakeholders) ? data.workingMemory.stakeholders : [],
                                  updated_at: data.workingMemory.updated_at || new Date().toISOString(),
                                  through_sequence: data.workingMemory.through_sequence || 0,
                                })
                              } else {
                                // No working memory yet - trigger update by sending a refresh request
                                // The actual update will happen on the next PM agent response
                                setPmWorkingMemoryError(null)
                                // Show a message that refresh will happen on next message
                                alert('Working memory will be refreshed automatically on the next PM agent response.')
                              }
                            } else {
                              console.error('[PM] Failed to load working memory:', data.error)
                            }
                          } catch (err) {
                            console.error('[PM] Failed to load working memory:', err)
                          } finally {
                            setPmWorkingMemoryLoading(false)
                          }
                        }}
                        disabled={workingMemoryLoading}
                        style={{ 
                          fontSize: '0.85em', 
                          padding: '2px 8px',
                          marginLeft: '8px',
                          cursor: workingMemoryLoading ? 'wait' : 'pointer'
                        }}
                        title="Refresh working memory now (reloads current state; full refresh happens on next PM response)"
                      >
                        {workingMemoryLoading ? 'Loading...' : 'Refresh'}
                      </button>
                    </div>
                    {workingMemoryOpen && (
                      <div className="diag-section-content">
                        {workingMemoryError ? (
                          <div style={{ color: '#d32f2f', fontSize: '0.9em', marginBottom: '8px' }}>
                            Error: {workingMemoryError}
                          </div>
                        ) : null}
                        {workingMemory ? (() => {
                          const wm = workingMemory!
                          return (
                            <div style={{ fontSize: '0.9em' }}>
                              <div style={{ marginBottom: '12px', color: '#666', fontSize: '0.85em' }}>
                                Last updated: {new Date(wm.lastUpdatedAt).toLocaleString()}
                              </div>
                              {wm.summary && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Summary:</strong>
                                  <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{wm.summary}</div>
                                </div>
                              )}
                              {wm.goals && Array.isArray(wm.goals) && wm.goals.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Goals:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.goals.map((goal, idx) => (
                                      <li key={idx}>{goal}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.requirements && Array.isArray(wm.requirements) && wm.requirements.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Requirements:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.requirements.map((req, idx) => (
                                      <li key={idx}>{req}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.constraints && Array.isArray(wm.constraints) && wm.constraints.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Constraints:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.constraints.map((constraint, idx) => (
                                      <li key={idx}>{constraint}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.decisions && Array.isArray(wm.decisions) && wm.decisions.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Decisions:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.decisions.map((decision, idx) => (
                                      <li key={idx}>{decision}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.assumptions && Array.isArray(wm.assumptions) && wm.assumptions.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Assumptions:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.assumptions.map((assumption, idx) => (
                                      <li key={idx}>{assumption}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.openQuestions && Array.isArray(wm.openQuestions) && wm.openQuestions.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Open Questions:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.openQuestions.map((q, idx) => (
                                      <li key={idx}>{q}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {wm.glossary && Object.keys(wm.glossary).length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Glossary:</strong>
                                  <dl style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {Object.entries(wm.glossary).map(([term, def]) => (
                                      <React.Fragment key={term}>
                                        <dt style={{ fontWeight: 'bold' }}>{term}:</dt>
                                        <dd style={{ marginLeft: '20px', marginBottom: '4px' }}>{def}</dd>
                                      </React.Fragment>
                                    ))}
                                  </dl>
                                </div>
                              )}
                              {wm.stakeholders && Array.isArray(wm.stakeholders) && wm.stakeholders.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                  <strong>Stakeholders:</strong>
                                  <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                                    {wm.stakeholders.map((s, idx) => (
                                      <li key={idx}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {!wm.summary && (!wm.goals || wm.goals.length === 0) && (!wm.requirements || wm.requirements.length === 0) && 
                                (!wm.constraints || wm.constraints.length === 0) && (!wm.decisions || wm.decisions.length === 0) && (!wm.assumptions || wm.assumptions.length === 0) && 
                                (!wm.openQuestions || (Array.isArray(wm.openQuestions) && wm.openQuestions.length === 0)) && (!wm.glossary || Object.keys(wm.glossary || {}).length === 0) && (!wm.stakeholders || (Array.isArray(wm.stakeholders) && wm.stakeholders.length === 0)) && (
                                  <div style={{ color: '#666', fontStyle: 'italic' }}>
                                    Working memory is empty. It will be populated automatically as the conversation grows.
                                  </div>
                                )}
                            </div>
                          )
                        })() : (
                          <div style={{ color: '#666', fontStyle: 'italic' }}>
                            {workingMemoryLoading ? 'Loading...' : 'No working memory yet. It will be created automatically as the conversation grows.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                        <div><strong>Ticket ID:</strong> {diagnostics.lastTicketCreationResult!.id}</div>
                        <div><strong>File path:</strong> {diagnostics.lastTicketCreationResult!.filePath}</div>
                        {diagnostics.lastTicketCreationResult!.retried && diagnostics.lastTicketCreationResult!.attempts != null && (
                          <div><strong>Retry:</strong> Collision resolved after {diagnostics.lastTicketCreationResult!.attempts} attempt(s)</div>
                        )}
                        <div>
                          <strong>Sync:</strong>{' '}
                          {diagnostics.lastTicketCreationResult!.syncSuccess ? (
                            <span className="diag-sync-ok">Success</span>
                          ) : (
                            <span className="diag-sync-error">
                              Failed
                              {diagnostics.lastTicketCreationResult!.syncError && (
                                <> — {diagnostics.lastTicketCreationResult!.syncError}</>
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
                  const createTicketCall = diagnostics.lastPmToolCalls!.find(c => c.name === 'create_ticket')
                  const updateTicketCall = diagnostics.lastPmToolCalls!.find(c => c.name === 'update_ticket_body')
                  const readinessCall = createTicketCall || updateTicketCall
                  if (!readinessCall) return null
                  
                  const output = readinessCall!.output as any
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
            )}
            </div>
          )}
          </section>
        )}

        {/* Restore chat button when collapsed (0160) */}
        {chatCollapsed && (
          <button
            type="button"
            className="chat-restore-btn"
            onClick={() => setChatCollapsed(false)}
            aria-label="Restore chat"
            title="Restore chat"
          >
            <span aria-hidden="true">▶</span>
            <span className="chat-restore-label">Chat</span>
          </button>
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
                className="conversation-modal-close" 
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
                className="conversation-modal-close" 
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
                        onClick={() => handleProcessReviewIgnore(recommendation.id)}
                        disabled={recommendation.isCreating}
                        style={{
                          padding: '8px 16px',
                          background: 'var(--hal-surface)',
                          color: 'var(--hal-text)',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '4px',
                          cursor: recommendation.isCreating ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          opacity: recommendation.isCreating ? 0.6 : 1,
                        }}
                      >
                        Ignore
                      </button>
                      <button
                        type="button"
                        onClick={() => handleProcessReviewImplement(recommendation.id)}
                        disabled={recommendation.isCreating}
                        style={{
                          padding: '8px 16px',
                          background: recommendation.isCreating ? 'var(--hal-text-muted)' : 'var(--hal-primary)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: recommendation.isCreating ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          opacity: recommendation.isCreating ? 0.7 : 1,
                        }}
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
    </div>
  )
}

export default App

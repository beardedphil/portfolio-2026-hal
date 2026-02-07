import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

type Agent = 'project-manager' | 'implementation-agent' | 'qa-agent'
type ChatTarget = Agent | 'standup'

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
}

// Conversation instance with unique ID (0070)
type Conversation = {
  id: string // e.g., "implementation-agent-1", "qa-agent-2"
  agentRole: Agent // The agent role this conversation belongs to
  instanceNumber: number // 1, 2, 3, etc.
  messages: Message[]
  createdAt: Date
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

const PM_AGENT_ID = 'project-manager'

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
  const match = conversationId.match(/^(project-manager|implementation-agent|qa-agent)-(\d+)$/)
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
  { id: 'standup', label: 'Standup (all agents)' },
]
// DEBUG: QA option should be visible
console.log('CHAT_OPTIONS:', CHAT_OPTIONS.map(o => o.label))

/** Kanban iframe URL: use proxy path so HAL dev server (5173) proxies to kanban (5174); trailing slash required for Vite base. */
const KANBAN_URL = '/kanban-app/'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getMessageAuthorLabel(agent: Message['agent']): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent') return 'HAL'
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
  const [kanbanLoaded, setKanbanLoaded] = useState(false)
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
  const [outboundRequestExpanded, setOutboundRequestExpanded] = useState(false)
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false)
  const messageIdRef = useRef(0)
  const pmMaxSequenceRef = useRef(0)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const kanbanIframeRef = useRef<HTMLIFrameElement>(null)
  const selectedChatTargetRef = useRef<ChatTarget>(selectedChatTarget)
  
  const [unreadByTarget, setUnreadByTarget] = useState<Record<ChatTarget, number>>(() => ({
    'project-manager': 0,
    'implementation-agent': 0,
    'qa-agent': 0,
    standup: 0,
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
  /** Whether the divider is currently being dragged (0060). */
  const [isDragging, setIsDragging] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)
  /** Animation frame ID for smooth resizing (0076). */
  const rafIdRef = useRef<number | null>(null)
  /** Current mouse position during drag (0076). */
  const mouseXRef = useRef<number | null>(null)

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
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

  // Do not restore connected GitHub repo from localStorage on load (0079). User must connect a repo this session so Kanban does not fetch tickets before any connection.

  const refreshGithubAuth = useCallback(async () => {
    try {
      setGithubConnectError(null)
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const text = await res.text()
      if (!res.ok) {
        setGithubAuth(null)
        setGithubConnectError(text.slice(0, 200) || 'Failed to check GitHub auth status.')
        return
      }
      const json = JSON.parse(text) as GithubAuthMe
      setGithubAuth(json)
    } catch (err) {
      setGithubAuth(null)
      setGithubConnectError(err instanceof Error ? err.message : String(err))
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
    if (connectedGithubRepo?.fullName) {
      win.postMessage({ type: 'HAL_CONNECT_REPO', repoFullName: connectedGithubRepo.fullName }, origin)
    }
  }, [kanbanLoaded, connectedGithubRepo, supabaseUrl, supabaseAnonKey])

  // Persist chat width to localStorage (0060)
  useEffect(() => {
    try {
      localStorage.setItem('hal-chat-width', String(chatWidth))
    } catch {
      // ignore localStorage errors
    }
  }, [chatWidth])

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

  // Get active messages from selected conversation (0070)
  // For PM and Standup, always use default conversation; for Implementation/QA, use selected conversation if modal is open
  const activeMessages = (() => {
    if (selectedChatTarget === 'project-manager' || selectedChatTarget === 'standup') {
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

  // Get preview text for PM or Standup chat (0087)
  const getChatTargetPreview = useCallback((target: ChatTarget): string => {
    if (target === 'project-manager' || target === 'standup') {
      const defaultConvId = getConversationId('project-manager', 1)
      if (conversations.has(defaultConvId)) {
        const conv = conversations.get(defaultConvId)!
        return getConversationPreview(conv)
      }
    }
    return 'No messages yet'
  }, [conversations, getConversationPreview])

  // Format agent status for display (0087)
  const formatAgentStatus = useCallback((status: typeof implAgentRunStatus | typeof qaAgentRunStatus): string => {
    if (status === 'preparing') return 'Preparing'
    if (status === 'fetching_ticket') return 'Fetching ticket'
    if (status === 'resolving_repo') return 'Resolving repository'
    if (status === 'fetching_branch') return 'Finding branch'
    if (status === 'launching') return 'Launching'
    if (status === 'polling') return 'Running'
    if (status === 'generating_report') return 'Generating report'
    if (status === 'merging') return 'Merging'
    if (status === 'moving_ticket') return 'Moving ticket'
    if (status === 'completed') return 'Done'
    if (status === 'failed') return 'Failed'
    return 'Idle'
  }, [])

  // Auto-scroll transcript to bottom when messages or typing indicator change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [activeMessages, agentTypingTarget, selectedConversationId, implAgentRunStatus, qaAgentRunStatus, implAgentProgress, qaAgentProgress])

  // Persist conversations to localStorage only when project connected and not using Supabase (DB is source of truth when attached)
  useEffect(() => {
    if (!connectedProject || (supabaseUrl != null && supabaseAnonKey != null)) return
    const result = saveConversationsToStorage(connectedProject, conversations)
    if (!result.success && result.error) {
      setPersistenceError(result.error)
    } else {
      setPersistenceError(null)
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
        const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

  // Get or create a conversation for an agent role (0070)
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

  const addMessage = useCallback((conversationId: string, agent: Message['agent'], content: string, id?: number, imageAttachments?: ImageAttachment[]) => {
    const nextId = id ?? ++messageIdRef.current
    if (id != null) messageIdRef.current = Math.max(messageIdRef.current, nextId)
    setConversations((prev) => {
      const next = new Map(prev)
      const conv = next.get(conversationId)
      if (!conv) return next
      next.set(conversationId, {
        ...conv,
        messages: [...conv.messages, { id: nextId, agent, content, timestamp: new Date(), imageAttachments }],
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


  type CheckUnassignedResult = {
    moved: string[]
    notReady: Array<{ id: string; title?: string; missingItems: string[] }>
    error?: string
  }

  const formatUnassignedCheckMessage = useCallback((result: CheckUnassignedResult): string => {
    if (result.error) {
      return `[PM] Unassigned check failed: ${result.error}`
    }
    const movedStr = result.moved.length ? `Moved to To Do: ${result.moved.join(', ')}.` : ''
    const notReadyParts = result.notReady.map(
      (n) => `${n.id}${n.title ? ` (${n.title})` : ''} — ${n.missingItems.join('; ')}`
    )
    const notReadyStr =
      result.notReady.length > 0
        ? `Not ready (not moved): ${notReadyParts.join('. ')}`
        : result.moved.length === 0
          ? 'No tickets in Unassigned, or all were already ready.'
          : ''
    return `[PM] Unassigned check: ${movedStr} ${notReadyStr}`.trim()
  }, [])

  const runUnassignedCheck = useCallback(
    async (url: string, key: string, projectId?: string | null) => {
      const doFetch = async (): Promise<Response> => {
        return fetch('/api/pm/check-unassigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }),
        })
      }
      try {
        let res = await doFetch()
        if (!res.ok && res.type === 'basic') {
          const text = await res.text()
          try {
            const data = JSON.parse(text) as CheckUnassignedResult & { error?: string }
            if (data.error?.includes('not available') || data.error?.includes('missing or outdated')) {
              await new Promise((r) => setTimeout(r, 3000))
              res = await doFetch()
            }
          } catch {
            // use original res
          }
        }
        const result = (await res.json()) as CheckUnassignedResult
        const msg = formatUnassignedCheckMessage(result)
        if (projectId) {
          const supabase = createClient(url, key)
          const nextSeq = pmMaxSequenceRef.current + 1
          await supabase.from('hal_conversation_messages').insert({
            project_id: projectId,
            agent: PM_AGENT_ID,
            role: 'assistant',
            content: msg,
            sequence: nextSeq,
          })
          pmMaxSequenceRef.current = nextSeq
          addMessage('project-manager', 'project-manager', msg, nextSeq)
        } else {
          addMessage('project-manager', 'project-manager', msg)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const isFetchError = /failed to fetch|network error/i.test(errMsg)
        if (isFetchError) {
          await new Promise((r) => setTimeout(r, 3000))
          try {
            const res = await doFetch()
            const result = (await res.json()) as CheckUnassignedResult
            const msg = formatUnassignedCheckMessage(result)
            if (projectId) {
              const supabase = createClient(url, key)
              const nextSeq = pmMaxSequenceRef.current + 1
              await supabase.from('hal_conversation_messages').insert({
                project_id: projectId,
                agent: PM_AGENT_ID,
                role: 'assistant',
                content: msg,
                sequence: nextSeq,
              })
              pmMaxSequenceRef.current = nextSeq
              addMessage('project-manager', 'project-manager', msg, nextSeq)
            } else {
              addMessage('project-manager', 'project-manager', msg)
            }
            return
          } catch {
            // fall through to friendly message
          }
        }
        const friendlyMsg = isFetchError
          ? '[PM] Unassigned check couldn’t run (server may be busy or building). Try connecting again in a moment.'
          : `[PM] Unassigned check failed: ${errMsg}`
        addMessage('project-manager', 'project-manager', friendlyMsg)
      }
    },
    [formatUnassignedCheckMessage, addMessage]
  )

  // When Kanban completes sync, run Unassigned check and post result to PM chat
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data
      if (data?.type !== 'HAL_SYNC_COMPLETED') return
      if (supabaseUrl && supabaseAnonKey && connectedProject) {
        runUnassignedCheck(supabaseUrl, supabaseAnonKey, connectedProject).catch(() => {})
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [supabaseUrl, supabaseAnonKey, connectedProject, runUnassignedCheck])

  /** Trigger agent run for a given message and target (used by handleSend and HAL_OPEN_CHAT_AND_SEND) */
  const triggerAgentRun = useCallback(
    (content: string, target: ChatTarget, imageAttachments?: ImageAttachment[], conversationId?: string) => {
      // Get or create conversation ID (0070)
      const convId = conversationId || getDefaultConversationId(target === 'project-manager' ? 'project-manager' : target === 'standup' ? 'project-manager' : target)
      const useDb = target === 'project-manager' && supabaseUrl != null && supabaseAnonKey != null && connectedProject != null
      if (!useDb) addMessage(convId, 'user', content, undefined, imageAttachments)
      setLastAgentError(null)

      if (target === 'project-manager') {
        setLastAgentError(null)
        setOpenaiLastError(null)
        setLastPmOutboundRequest(null)
        setLastPmToolCalls(null)
        setAgentTypingTarget('project-manager')
        ;(async () => {
          try {
            let body: { message: string; conversationHistory?: Array<{ role: string; content: string }>; previous_response_id?: string; projectId?: string; repoFullName?: string; supabaseUrl?: string; supabaseAnonKey?: string; images?: Array<{ dataUrl: string; filename: string; mimeType: string }> } = { message: content }
            if (pmLastResponseId) body.previous_response_id = pmLastResponseId
            if (connectedProject) body.projectId = connectedProject
            if (connectedGithubRepo?.fullName) body.repoFullName = connectedGithubRepo.fullName
            // Always send Supabase creds when we have them so create_ticket is available (0011)
            if (supabaseUrl && supabaseAnonKey) {
              body.supabaseUrl = supabaseUrl
              body.supabaseAnonKey = supabaseAnonKey
            }
            // Include image attachments if present
            if (imageAttachments && imageAttachments.length > 0) {
              body.images = imageAttachments.map((img) => ({
                dataUrl: img.dataUrl,
                filename: img.filename,
                mimeType: img.file.type,
              }))
            }

            if (useDb && supabaseUrl && supabaseAnonKey && connectedProject) {
              const nextSeq = pmMaxSequenceRef.current + 1
              const supabase = createClient(supabaseUrl, supabaseAnonKey)
              const { error: insertErr } = await supabase.from('hal_conversation_messages').insert({
                project_id: connectedProject,
                agent: PM_AGENT_ID,
                role: 'user',
                content,
                sequence: nextSeq,
              })
              if (insertErr) {
                setPersistenceError(`DB: ${insertErr.message}`)
                addMessage(convId, 'user', content, undefined, imageAttachments)
              } else {
                pmMaxSequenceRef.current = nextSeq
                addMessage(convId, 'user', content, nextSeq, imageAttachments)
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

            const res = await fetch('/api/pm/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            setOpenaiLastStatus(String(res.status))
            const text = await res.text()
            
            let data: PmAgentResponse
            try {
              data = JSON.parse(text) as PmAgentResponse
            } catch {
              setAgentTypingTarget(null)
              setOpenaiLastError('Invalid JSON response from PM endpoint')
              setLastAgentError('Invalid JSON response')
              addMessage(convId, 'project-manager', `[PM] Error: Invalid response format`)
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
                  : '[PM] (No response). Open Diagnostics to see whether create_ticket was available and any tool calls.'
            }
            setAgentTypingTarget(null)
            if (useDb && supabaseUrl && supabaseAnonKey && connectedProject) {
              const nextSeq = pmMaxSequenceRef.current + 1
              const supabase = createClient(supabaseUrl, supabaseAnonKey)
              await supabase.from('hal_conversation_messages').insert({
                project_id: connectedProject,
                agent: PM_AGENT_ID,
                role: 'assistant',
                content: reply,
                sequence: nextSeq,
              })
              pmMaxSequenceRef.current = nextSeq
              addMessage(convId, 'project-manager', reply, nextSeq)
            } else {
              addMessage(convId, 'project-manager', reply)
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
        if (ticketId) {
          setImplAgentTicketId(ticketId)
          // Notify Kanban iframe about agent assignment (0114)
          if (kanbanIframeRef.current?.contentWindow) {
            kanbanIframeRef.current.contentWindow.postMessage(
              { type: 'HAL_AGENT_ASSIGNMENT', ticketId, agentName: 'Implementation Agent', assigned: true },
              '*'
            )
          }
        }

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
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'implementation',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
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
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`)
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
                
                // Notify Kanban iframe to move ticket from Doing to QA (0084)
                const ticketIdForMove = implAgentTicketId
                if (ticketIdForMove && kanbanIframeRef.current?.contentWindow) {
                  kanbanIframeRef.current.contentWindow.postMessage(
                    { type: 'HAL_TICKET_IMPLEMENTATION_COMPLETE', ticketId: ticketIdForMove },
                    '*'
                  )
                }
                
                setImplAgentRunId(null)
                // Notify Kanban iframe about agent unassignment (0114)
                if (implAgentTicketId && kanbanIframeRef.current?.contentWindow) {
                  kanbanIframeRef.current.contentWindow.postMessage(
                    { type: 'HAL_AGENT_ASSIGNMENT', ticketId: implAgentTicketId, agentName: 'Implementation Agent', assigned: false },
                    '*'
                  )
                }
                setImplAgentTicketId(null)
                setCursorRunAgentType(null)
                setAgentTypingTarget(null)
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
        if (ticketId) {
          setQaAgentTicketId(ticketId)
          // Notify Kanban iframe about agent assignment (0114)
          if (kanbanIframeRef.current?.contentWindow) {
            kanbanIframeRef.current.contentWindow.postMessage(
              { type: 'HAL_AGENT_ASSIGNMENT', ticketId, agentName: 'QA Agent', assigned: true },
              '*'
            )
          }
        }

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
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'qa',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
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
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`)
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
                // Notify Kanban iframe about agent unassignment (0114)
                if (qaAgentTicketId && kanbanIframeRef.current?.contentWindow) {
                  kanbanIframeRef.current.contentWindow.postMessage(
                    { type: 'HAL_AGENT_ASSIGNMENT', ticketId: qaAgentTicketId, agentName: 'QA Agent', assigned: false },
                    '*'
                  )
                }
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
    ]
  )

  // Track most recent work button click event for diagnostics (0072)
  const [lastWorkButtonClick, setLastWorkButtonClick] = useState<{ eventId: string; timestamp: Date; chatTarget: ChatTarget; message: string } | null>(null)

  // Handle chat open and send message requests from Kanban
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; chatTarget?: ChatTarget; message?: string }
      if (data?.type !== 'HAL_OPEN_CHAT_AND_SEND') return
      if (!data.chatTarget || !data.message) return
      
      // Generate unique event ID for this click
      const eventId = `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setLastWorkButtonClick({
        eventId,
        timestamp: new Date(),
        chatTarget: data.chatTarget,
        message: data.message,
      })
      
      // Switch to the requested chat target
      setSelectedChatTarget(data.chatTarget)
      
      // For Implementation and QA agents, create a new conversation instance (0070)
      let conversationId: string | undefined
      if (data.chatTarget === 'implementation-agent' || data.chatTarget === 'qa-agent') {
        conversationId = getOrCreateConversation(data.chatTarget)
        setSelectedConversationId(conversationId)
      } else {
        // For PM and standup, use default conversation
        conversationId = getDefaultConversationId(data.chatTarget === 'project-manager' ? 'project-manager' : 'project-manager')
      }
      
      // Don't add message here - triggerAgentRun handles it appropriately based on DB usage
      // This prevents duplicate messages (0072)
      
      // Trigger the agent run (which will add the message if needed)
      triggerAgentRun(data.message, data.chatTarget, undefined, conversationId)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [triggerAgentRun, getOrCreateConversation, getDefaultConversationId])

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
    } else if (selectedChatTarget === 'standup') {
      // Standup uses a special conversation
      convId = getDefaultConversationId('project-manager') // Reuse PM conversation for standup
    } else {
      convId = getDefaultConversationId(selectedChatTarget === 'project-manager' ? 'project-manager' : selectedChatTarget)
    }

    const useDb = selectedChatTarget === 'project-manager' && supabaseUrl != null && supabaseAnonKey != null && connectedProject != null
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
    
    if (!useDb) addMessage(convId, 'user', content, undefined, attachments)
    setInputValue('')
    setImageAttachment(null)
    setImageError(null)
    setSendValidationError(null)
    setLastAgentError(null)

    // Use the extracted triggerAgentRun function
    triggerAgentRun(content, selectedChatTarget, attachments, convId)
    
    // Standup handling (not part of triggerAgentRun)
    if (selectedChatTarget === 'standup') {
      setAgentTypingTarget('standup')
      setTimeout(() => {
        addMessage(convId, 'system', '--- Standup (all agents) ---')
      }, 100)
      setTimeout(() => {
        addMessage(convId, 'project-manager', `[Standup] Project Manager:
• Reviewed ticket backlog
• No blockers identified
• Ready to assist with prioritization`)
      }, 300)
      setTimeout(() => {
        addMessage(convId, 'implementation-agent', `[Standup] Implementation Agent:
• Awaiting task assignment
• Development environment ready
• No active work in progress`)
      }, 600)
      setTimeout(() => {
        addMessage(convId, 'system', '--- End of Standup ---')
        setAgentTypingTarget(null)
      }, 900)
    }
  }, [inputValue, selectedChatTarget, selectedConversationId, conversations, addMessage, supabaseUrl, supabaseAnonKey, connectedProject, triggerAgentRun, getDefaultConversationId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleIframeLoad = useCallback(() => {
    setKanbanLoaded(true)
    setLastError(null)
    // Send current theme to Kanban iframe immediately on load (0078)
    if (kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_THEME_CHANGE', theme },
        '*'
      )
    }
  }, [theme])

  const handleIframeError = useCallback(() => {
    setKanbanLoaded(false)
    setLastError('Failed to load kanban board. Run "npm run dev" from the repo root to start HAL and Kanban together.')
  }, [])

  // If iframe does not load within 8s, show error (proxy target 5174 may not be running)
  useEffect(() => {
    if (kanbanLoaded) return
    const t = window.setTimeout(() => {
      setLastError((prev) =>
        prev ? prev : 'Kanban did not load. Run "npm run dev" from the repo root to start both HAL and Kanban.'
      )
    }, 8000)
    return () => window.clearTimeout(t)
  }, [kanbanLoaded])

  const handleThemeToggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const handleDisconnect = useCallback(() => {
    if (kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_DISCONNECT' },
        window.location.origin
      )
    }
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
    setUnreadByTarget({ 'project-manager': 0, 'implementation-agent': 0, 'qa-agent': 0, standup: 0 })
    // Do NOT clear agent status on disconnect (0097: preserve agent status across disconnect/reconnect)
    // Status boxes are gated by connectedProject, so they'll be hidden anyway
    // Only clear ticket IDs and diagnostics (these are per-session)
    setImplAgentTicketId(null)
    setQaAgentTicketId(null)
    setAutoMoveDiagnostics([])
    setCursorRunAgentType(null)
    setOrphanedCompletionSummary(null)
    // Do NOT remove localStorage items on disconnect (0097: preserve chats and agent status across disconnect/reconnect)
    // They will be restored when reconnecting to the same repo
  }, [])

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
    kanbanRenderMode: 'iframe (fallback)',
    selectedChatTarget,
    pmImplementationSource: selectedChatTarget === 'project-manager' ? 'hal-agents' : 'inline',
    lastAgentError,
    lastError,
    openaiLastStatus,
    openaiLastError,
    kanbanLoaded,
    kanbanUrl: KANBAN_URL,
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
  }

  return (
    <div className="hal-app">
      <header className="hal-header">
        <h1>HAL</h1>
        <span className="hal-subtitle">Agent Workspace</span>
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

      <main className="hal-main">
        {/* Left column: Kanban board */}
        <section className="hal-kanban-region" aria-label="Kanban board">
          <div className="kanban-header">
            <h2>Kanban Board</h2>
            <div className="kanban-header-actions">
              {!connectedProject ? (
                <button type="button" className="connect-project-btn" onClick={handleGithubConnect}>
                  Connect GitHub Repo
                </button>
              ) : (
                <div className="project-info">
                  <span className="project-name">{connectedProject}</span>
                  {connectedGithubRepo && (
                    <span className="project-name" style={{ marginLeft: '8px', opacity: 0.85 }}>
                      Repo: {connectedGithubRepo.fullName}
                    </span>
                  )}
                  <button
                    type="button"
                    className="disconnect-btn"
                    onClick={handleDisconnect}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
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
                      : openChatTarget === 'standup'
                      ? 'Standup (all agents)'
                      : 'Chat'}
                  </div>
                  <div className="chat-window-actions">
                    <button
                      type="button"
                      className="chat-window-return-link"
                      onClick={() => {
                        setOpenChatTarget(null)
                      }}
                    >
                      Return to Kanban
                    </button>
                    <button
                      type="button"
                      className="chat-window-close"
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
                  {/* Render the chat UI here - same as the right panel chat */}
                  {(() => {
                // Use activeMessages which is computed based on selectedChatTarget and selectedConversationId
                // These are set when opening a chat, so they should be correct
                const displayMessages = activeMessages
                const displayTarget = selectedChatTarget

                return (
                  <>
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
                                 implAgentRunStatus === 'polling' ? 'Running' :
                                 implAgentRunStatus === 'completed' ? 'Completed' :
                                 implAgentRunStatus === 'failed' ? 'Failed' : 'Idle'}
                              </span>
                            </div>
                            {implAgentError && (
                              <div className="impl-agent-error" role="alert">
                                <strong>Error:</strong> {implAgentError}
                              </div>
                            )}
                            {implAgentProgress.length > 0 && (
                              <div className="impl-agent-progress-feed">
                                <div className="impl-agent-progress-label">Progress:</div>
                                <div className="impl-agent-progress-items">
                                  {implAgentProgress.slice(-5).map((p, idx) => (
                                    <div key={idx} className="impl-agent-progress-item">
                                      <span className="impl-agent-progress-time">[{formatTime(p.timestamp)}]</span>
                                      <span className="impl-agent-progress-message">{p.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
                              ? 'Say "QA ticket XXXX" (e.g. QA ticket 0046) to review the ticket implementation, generate a QA report, and merge to main if it passes.'
                              : 'Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable.'}
                          </p>
                        </div>
                        {(qaAgentRunStatus !== 'idle' || qaAgentError) && (
                          <div className="impl-agent-status-panel" role="status" aria-live="polite">
                            <div className="impl-agent-status-header">
                              <span className="impl-agent-status-label">Status:</span>
                              <span className={`impl-agent-status-value impl-status-${qaAgentRunStatus}`}>
                                {qaAgentRunStatus === 'preparing' ? 'Preparing' :
                                 qaAgentRunStatus === 'fetching_ticket' ? 'Fetching ticket' :
                                 qaAgentRunStatus === 'fetching_branch' ? 'Finding branch' :
                                 qaAgentRunStatus === 'launching' ? 'Launching QA' :
                                 qaAgentRunStatus === 'polling' ? 'Reviewing' :
                                 qaAgentRunStatus === 'generating_report' ? 'Generating report' :
                                 qaAgentRunStatus === 'merging' ? 'Merging' :
                                 qaAgentRunStatus === 'moving_ticket' ? 'Moving ticket' :
                                 qaAgentRunStatus === 'completed' ? 'Completed' :
                                 qaAgentRunStatus === 'failed' ? 'Failed' : 'Idle'}
                              </span>
                            </div>
                            {qaAgentError && (
                              <div className="impl-agent-error" role="alert">
                                <strong>Error:</strong> {qaAgentError}
                              </div>
                            )}
                            {qaAgentProgress.length > 0 && (
                              <div className="impl-agent-progress-feed">
                                <div className="impl-agent-progress-label">Progress:</div>
                                <div className="impl-agent-progress-items">
                                  {qaAgentProgress.slice(-5).map((p, idx) => (
                                    <div key={idx} className="impl-agent-progress-item">
                                      <span className="impl-agent-progress-time">[{formatTime(p.timestamp)}]</span>
                                      <span className="impl-agent-progress-message">{p.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Chat transcript */}
                    <div className="chat-transcript" ref={transcriptRef}>
                      {displayMessages.length === 0 && agentTypingTarget !== displayTarget ? (
                        <p className="transcript-empty">No messages yet. Start a conversation.</p>
                      ) : (
                        <>
                          {displayMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`message-row message-row-${msg.agent}`}
                              data-agent={msg.agent}
                            >
                              <div className={`message message-${msg.agent}`}>
                                <div className="message-header">
                                  <span className="message-author">{getMessageAuthorLabel(msg.agent)}</span>
                                  <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                                  {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                                    <span className="message-image-indicator" title={`${msg.imageAttachments.length} image${msg.imageAttachments.length > 1 ? 's' : ''} attached`}>
                                      📎 {msg.imageAttachments.length}
                                    </span>
                                  )}
                                </div>
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
                          ))}
                          {agentTypingTarget === displayTarget && (
                            <div className="message-row message-row-typing" data-agent="typing" aria-live="polite">
                              <div className="message message-typing">
                                <div className="message-header">
                                  <span className="message-author">HAL</span>
                                </div>
                                {displayTarget === 'implementation-agent' ? (
                                  <div className="impl-agent-status-timeline" role="status">
                                    <span className={implAgentRunStatus === 'preparing' ? 'impl-status-active' : ['fetching_ticket', 'resolving_repo', 'launching', 'polling', 'completed', 'failed'].includes(implAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Preparing
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={implAgentRunStatus === 'fetching_ticket' ? 'impl-status-active' : ['resolving_repo', 'launching', 'polling', 'completed', 'failed'].includes(implAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Fetching ticket
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={implAgentRunStatus === 'resolving_repo' ? 'impl-status-active' : ['launching', 'polling', 'completed', 'failed'].includes(implAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Resolving repo
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={implAgentRunStatus === 'launching' ? 'impl-status-active' : ['polling', 'completed', 'failed'].includes(implAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Launching agent
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={implAgentRunStatus === 'polling' ? 'impl-status-active' : ['completed', 'failed'].includes(implAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Running
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={implAgentRunStatus === 'completed' ? 'impl-status-done' : implAgentRunStatus === 'failed' ? 'impl-status-failed' : ''}>
                                      {implAgentRunStatus === 'completed' ? 'Completed' : implAgentRunStatus === 'failed' ? 'Failed' : '…'}
                                    </span>
                                  </div>
                                ) : displayTarget === 'qa-agent' ? (
                                  <div className="impl-agent-status-timeline" role="status">
                                    <span className={qaAgentRunStatus === 'preparing' ? 'impl-status-active' : ['fetching_ticket', 'fetching_branch', 'launching', 'polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Preparing
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'fetching_ticket' ? 'impl-status-active' : ['fetching_branch', 'launching', 'polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Fetching ticket
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'fetching_branch' ? 'impl-status-active' : ['launching', 'polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Finding branch
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'launching' ? 'impl-status-active' : ['polling', 'generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Launching QA
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'polling' ? 'impl-status-active' : ['generating_report', 'merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Reviewing
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'generating_report' ? 'impl-status-active' : ['merging', 'moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Generating report
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'merging' ? 'impl-status-active' : ['moving_ticket', 'completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Merging
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'moving_ticket' ? 'impl-status-active' : ['completed', 'failed'].includes(qaAgentRunStatus) ? 'impl-status-done' : ''}>
                                      Moving ticket
                                    </span>
                                    <span className="impl-status-arrow">→</span>
                                    <span className={qaAgentRunStatus === 'completed' ? 'impl-status-done' : qaAgentRunStatus === 'failed' ? 'impl-status-failed' : ''}>
                                      {qaAgentRunStatus === 'completed' ? 'Completed' : qaAgentRunStatus === 'failed' ? 'Failed' : '…'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="typing-bubble">
                                    <span className="typing-label">Thinking</span>
                                    <span className="typing-dots">
                                      <span className="typing-dot" />
                                      <span className="typing-dot" />
                                      <span className="typing-dot" />
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Chat composer */}
                    <div className="chat-composer">
                      {imageAttachment && (
                        <div className="image-attachment-preview">
                          <img src={imageAttachment.dataUrl} alt={imageAttachment.filename} className="attachment-thumbnail" />
                          <span className="attachment-filename">{imageAttachment.filename}</span>
                          <button type="button" className="remove-attachment-btn" onClick={handleRemoveImage} aria-label="Remove attachment">
                            ×
                          </button>
                        </div>
                      )}
                      {imageError && (
                        <div className="image-error-message" role="alert">
                          {imageError}
                        </div>
                      )}
                      {sendValidationError && (
                        <div className="image-error-message" role="alert">
                          {sendValidationError}
                        </div>
                      )}
                      <div className="composer-input-row">
                        <textarea
                          className="message-input"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Type a message... (Enter to send)"
                          rows={2}
                        />
                        <div className="composer-actions">
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
                          <button type="button" className="send-btn" onClick={handleSend} disabled={!!imageError}>
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                    </>
                  )
                  })()}
                </div>
              </>
            )}
          </div>
          {/* Kanban iframe (0096: always mounted to prevent empty board after closing chat) */}
          <div className={`kanban-frame-container ${openChatTarget ? 'kanban-frame-hidden' : 'kanban-frame-visible'}`}>
            <iframe
              ref={kanbanIframeRef}
              src={KANBAN_URL}
              title="Kanban Board"
              className="kanban-iframe"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
            {!kanbanLoaded && (
              <div className="kanban-loading-overlay">
                <p>Loading kanban board...</p>
                <p className="kanban-hint">
                  Run <code>npm run dev</code> from the repo root to start HAL and Kanban together.
                </p>
                {lastError && <p className="kanban-hint">{lastError}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Resizable divider (0060) */}
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

        {/* Right column: Chat UI */}
        <section className="hal-chat-region" aria-label="Chat" style={{ width: `${chatWidth}px` }}>
          <div className="chat-header">
            <h2>Chat</h2>
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
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

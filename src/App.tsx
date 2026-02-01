import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

type Agent = 'project-manager' | 'implementation-agent' | 'qa-agent'
type ChatTarget = Agent | 'standup'

type Message = {
  id: number
  agent: Agent | 'user' | 'system'
  content: string
  timestamp: Date
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
}

// localStorage helpers for conversation persistence (fallback when no project DB)
const CONVERSATION_STORAGE_PREFIX = 'hal-chat-conversations-'
/** Cap on character count for recent conversation so long technical messages don't dominate (~3k tokens). */
const CONVERSATION_RECENT_MAX_CHARS = 12_000

const PM_AGENT_ID = 'project-manager'

function getStorageKey(projectName: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${projectName}`
}

type SerializedMessage = Omit<Message, 'timestamp'> & { timestamp: string }

function saveConversationsToStorage(
  projectName: string,
  conversations: Record<ChatTarget, Message[]>
): { success: boolean; error?: string } {
  try {
    const serialized: Record<ChatTarget, SerializedMessage[]> = {} as Record<ChatTarget, SerializedMessage[]>
    for (const key of Object.keys(conversations) as ChatTarget[]) {
      serialized[key] = conversations[key].map((msg) => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
      }))
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
): { data: Record<ChatTarget, Message[]> | null; error?: string } {
  try {
    const raw = localStorage.getItem(getStorageKey(projectName))
    if (!raw) return { data: null }
    const parsed = JSON.parse(raw) as Record<ChatTarget, SerializedMessage[]>
    const result: Record<ChatTarget, Message[]> = {} as Record<ChatTarget, Message[]>
    for (const key of Object.keys(parsed) as ChatTarget[]) {
      result[key] = parsed[key].map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }))
    }
    return { data: result }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { data: null, error: `Failed to load conversations: ${errMsg}` }
  }
}

function getEmptyConversations(): Record<ChatTarget, Message[]> {
  return {
    'project-manager': [],
    'implementation-agent': [],
    'qa-agent': [],
    standup: [],
  }
}

const CHAT_OPTIONS: { id: ChatTarget; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent' },
  { id: 'qa-agent', label: 'QA' },
  { id: 'standup', label: 'Standup (all agents)' },
]
// DEBUG: QA option should be visible
console.log('CHAT_OPTIONS:', CHAT_OPTIONS.map(o => o.label))

const KANBAN_URL = 'http://localhost:5174'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getMessageAuthorLabel(agent: Message['agent']): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent') return 'HAL'
  return 'System'
}

function App() {
  const [selectedChatTarget, setSelectedChatTarget] = useState<ChatTarget>('project-manager')
  const [conversations, setConversations] = useState<Record<ChatTarget, Message[]>>(getEmptyConversations)
  const [inputValue, setInputValue] = useState('')
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastAgentError, setLastAgentError] = useState<string | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [openaiLastStatus, setOpenaiLastStatus] = useState<string | null>(null)
  const [openaiLastError, setOpenaiLastError] = useState<string | null>(null)
  const [kanbanLoaded, setKanbanLoaded] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [connectedProject, setConnectedProject] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [lastPmOutboundRequest, setLastPmOutboundRequest] = useState<object | null>(null)
  const [lastPmToolCalls, setLastPmToolCalls] = useState<ToolCallRecord[] | null>(null)
  const [lastTicketCreationResult, setLastTicketCreationResult] = useState<TicketCreationResult | null>(null)
  const [lastCreateTicketAvailable, setLastCreateTicketAvailable] = useState<boolean | null>(null)
  const [pmLastResponseId, setPmLastResponseId] = useState<string | null>(null)
  const [agentRunner, setAgentRunner] = useState<string | null>(null)
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null)
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string | null>(null)
  const [projectFolderHandle, setProjectFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
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
  /** Progress messages for Implementation Agent (0050). */
  const [implAgentProgress, setImplAgentProgress] = useState<Array<{ timestamp: Date; message: string }>>([])
  /** Last error message for Implementation Agent (0050). */
  const [implAgentError, setImplAgentError] = useState<string | null>(null)
  /** Current ticket ID for Implementation Agent (0061). */
  const [implAgentTicketId, setImplAgentTicketId] = useState<string | null>(null)
  /** Current ticket ID for QA Agent (0061). */
  const [qaAgentTicketId, setQaAgentTicketId] = useState<string | null>(null)
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

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
  }, [selectedChatTarget])

  // Persist chat width to localStorage (0060)
  useEffect(() => {
    try {
      localStorage.setItem('hal-chat-width', String(chatWidth))
    } catch {
      // ignore localStorage errors
    }
  }, [chatWidth])

  // Handle divider drag (0060)
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const mainElement = document.querySelector('.hal-main')
      if (!mainElement) return
      const mainRect = mainElement.getBoundingClientRect()
      // Calculate chat width: distance from mouse to right edge, accounting for divider (4px)
      const newWidth = mainRect.right - e.clientX - 4
      // Clamp between min and max widths
      const clampedWidth = Math.max(320, Math.min(800, newWidth))
      setChatWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging])

  // Persist Implementation Agent status to localStorage (0050)
  const IMPL_AGENT_STATUS_KEY = 'hal-impl-agent-status'
  const IMPL_AGENT_PROGRESS_KEY = 'hal-impl-agent-progress'
  const IMPL_AGENT_ERROR_KEY = 'hal-impl-agent-error'

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

  // Poll for pending file access requests and handle them (0052)
  useEffect(() => {
    if (!projectFolderHandle) return

    let pollInterval: number | null = null
    const poll = async () => {
      try {
        const res = await fetch('/api/pm/file-access/pending')
        if (!res.ok) return
        const data = (await res.json()) as { pending: Array<{ requestId: string; type: string; path?: string; pattern?: string; glob?: string; maxLines?: number }> }
        for (const req of data.pending) {
          if (req.type === 'read_file' && req.path) {
            const { readFileFromHandle } = await import('./fileAccess')
            const result = await readFileFromHandle(projectFolderHandle, req.path, req.maxLines ?? 500)
            await fetch('/api/pm/file-access/result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: req.requestId,
                success: 'content' in result,
                content: 'content' in result ? result.content : undefined,
                error: 'error' in result ? result.error : undefined,
              }),
            })
          } else if (req.type === 'search_files' && req.pattern) {
            const { searchFilesFromHandle } = await import('./fileAccess')
            const result = await searchFilesFromHandle(projectFolderHandle, req.pattern, req.glob ?? '**/*')
            await fetch('/api/pm/file-access/result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: req.requestId,
                success: 'matches' in result,
                matches: 'matches' in result ? result.matches : undefined,
                error: 'error' in result ? result.error : undefined,
              }),
            })
          }
        }
      } catch (err) {
        // Silently fail - polling will retry
      }
    }

    pollInterval = window.setInterval(poll, 500)
    poll() // Initial poll

    return () => {
      if (pollInterval != null) clearInterval(pollInterval)
    }
  }, [projectFolderHandle])

  const activeMessages = conversations[selectedChatTarget] ?? []

  // Auto-scroll transcript to bottom when messages or typing indicator change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [activeMessages, agentTypingTarget, selectedChatTarget, implAgentRunStatus, qaAgentRunStatus, implAgentProgress])

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

  const addMessage = useCallback((target: ChatTarget, agent: Message['agent'], content: string, id?: number) => {
    const nextId = id ?? ++messageIdRef.current
    if (id != null) messageIdRef.current = Math.max(messageIdRef.current, nextId)
    setConversations((prev) => ({
      ...prev,
      [target]: [...(prev[target] ?? []), { id: nextId, agent, content, timestamp: new Date() }],
    }))
    if (agent !== 'user' && target !== selectedChatTargetRef.current) {
      setUnreadByTarget((prev) => ({ ...prev, [target]: (prev[target] ?? 0) + 1 }))
    }
    
    // Auto-move ticket when QA completion message is detected in QA Agent chat (0061)
    if (target === 'qa-agent' && agent === 'qa-agent') {
      const isQaCompletion = /qa.*complete|qa.*report|qa.*pass|verdict.*pass|move.*human.*loop|verified.*main|pass.*ok.*merge/i.test(content)
      if (isQaCompletion) {
        const isPass = /pass|ok.*merge|verified.*main|verdict.*pass/i.test(content) && !/fail|verdict.*fail/i.test(content)
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
        }
      }
    }
  }, [qaAgentTicketId, extractTicketId, moveTicketToColumn, addAutoMoveDiagnostic])

  /** Add auto-move diagnostic entry (0061). */
  const addAutoMoveDiagnostic = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    setAutoMoveDiagnostics((prev) => [...prev, { timestamp: new Date(), message, type }])
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

  // Handle chat open and send message requests from Kanban
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; chatTarget?: ChatTarget; message?: string }
      if (data?.type !== 'HAL_OPEN_CHAT_AND_SEND') return
      if (!data.chatTarget || !data.message) return
      
      // Switch to the requested chat target
      setSelectedChatTarget(data.chatTarget)
      
      // Add the message to the chat
      addMessage(data.chatTarget, 'user', data.message)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [addMessage])

  const handleSend = useCallback(() => {
    const content = inputValue.trim()
    if (!content) return

    const useDb = selectedChatTarget === 'project-manager' && supabaseUrl != null && supabaseAnonKey != null && connectedProject != null
    if (!useDb) addMessage(selectedChatTarget, 'user', content)
    setInputValue('')
    setLastAgentError(null)

    if (selectedChatTarget === 'project-manager') {
      setLastAgentError(null)
      setOpenaiLastError(null)
      setLastPmOutboundRequest(null)
      setLastPmToolCalls(null)
      setAgentTypingTarget('project-manager')
      ;(async () => {
        try {
          let body: { message: string; conversationHistory?: Array<{ role: string; content: string }>; previous_response_id?: string; projectId?: string; supabaseUrl?: string; supabaseAnonKey?: string } = { message: content }
          if (pmLastResponseId) body.previous_response_id = pmLastResponseId
          if (connectedProject) body.projectId = connectedProject
          // Always send Supabase creds when we have them so create_ticket is available (0011)
          if (supabaseUrl && supabaseAnonKey) {
            body.supabaseUrl = supabaseUrl
            body.supabaseAnonKey = supabaseAnonKey
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
              addMessage('project-manager', 'user', content)
            } else {
              pmMaxSequenceRef.current = nextSeq
              addMessage('project-manager', 'user', content, nextSeq)
            }
          } else {
            const pmMessages = conversations['project-manager'] ?? []
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
            addMessage('project-manager', 'project-manager', `[PM] Error: Invalid response format`)
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
            addMessage('project-manager', 'project-manager', displayMsg)
            return
          }

          setOpenaiLastError(null)
          setLastAgentError(null)
          if (data.responseId != null) setPmLastResponseId(data.responseId)

          // When reply is empty but a ticket was just created, show ticket creation summary (0011)
          let reply = data.reply || ''
          if (!reply.trim() && data.ticketCreationResult) {
            const t = data.ticketCreationResult
            reply = t.syncSuccess
              ? `Created ticket **${t.id}** at \`${t.filePath}\`. It should appear in Unassigned.`
              : `Created ticket **${t.id}** at \`${t.filePath}\`. Sync to repo failed: ${t.syncError ?? 'unknown'}. You can run \`npm run sync-tickets\` from the repo root.`
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
            addMessage('project-manager', 'project-manager', reply, nextSeq)
          } else {
            addMessage('project-manager', 'project-manager', reply)
          }
        } catch (err) {
          setAgentTypingTarget(null)
          const msg = err instanceof Error ? err.message : String(err)
          setOpenaiLastStatus(null)
          setOpenaiLastError(msg)
          setLastAgentError(msg)
          addMessage('project-manager', 'project-manager', `[PM] Error: ${msg}`)
        }
      })()
    } else if (selectedChatTarget === 'implementation-agent') {
      const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
      if (!cursorApiConfigured) {
        addMessage(
          'implementation-agent',
          'implementation-agent',
          '[Implementation Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
        )
        return
      }

      const isImplementTicket = /implement\s+ticket\s+\d{4}/i.test(content)
      const ticketId = extractTicketId(content)
      if (ticketId) {
        setImplAgentTicketId(ticketId)
      }

      setAgentTypingTarget('implementation-agent')
      setImplAgentRunStatus('preparing')
      setImplAgentProgress([])
      setImplAgentError(null)
      // Track which agent initiated this run (0067)
      setCursorRunAgentType('implementation-agent')
      setOrphanedCompletionSummary(null)

      ;(async () => {
        setImplAgentRunStatus(isImplementTicket ? 'fetching_ticket' : 'preparing')
        const addProgress = (message: string) => {
          const progressEntry = { timestamp: new Date(), message }
          setImplAgentProgress((prev) => [...prev, progressEntry])
          // Also add as a system message to the conversation (0050)
          addMessage('implementation-agent', 'system', `[Progress] ${message}`)
        }

        try {
          const body: { message: string; supabaseUrl?: string; supabaseAnonKey?: string } = { message: content }
          if (supabaseUrl && supabaseAnonKey) {
            body.supabaseUrl = supabaseUrl
            body.supabaseAnonKey = supabaseAnonKey
          }
          const res = await fetch('/api/implementation-agent/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (!res.body) {
            setImplAgentRunStatus('failed')
            const errorMsg = 'No response body from server.'
            setImplAgentError(errorMsg)
            addMessage(
              'implementation-agent',
              'implementation-agent',
              `[Implementation Agent] ${errorMsg}`
            )
            setTimeout(() => setAgentTypingTarget(null), 500)
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let lastStage = ''
          let finalContent = ''
          let finalError = ''
          let lastProgressTime = Date.now()
          const PROGRESS_INTERVAL = 10000 // 10 seconds

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              try {
                const data = JSON.parse(trimmed) as {
                  stage?: string
                  cursorStatus?: string
                  success?: boolean
                  content?: string
                  error?: string
                  status?: string
                }
                const stage = data.stage ?? ''
                if (stage) lastStage = stage
                
                // Update status and emit progress messages (0050)
                if (stage === 'fetching_ticket') {
                  setImplAgentRunStatus('fetching_ticket')
                  addProgress('Fetching ticket from database...')
                } else if (stage === 'resolving_repo') {
                  setImplAgentRunStatus('resolving_repo')
                  addProgress('Resolving GitHub repository...')
                } else if (stage === 'launching') {
                  setImplAgentRunStatus('launching')
                  addProgress('Launching cloud agent...')
                } else if (stage === 'polling') {
                  setImplAgentRunStatus('polling')
                  const cursorStatus = data.cursorStatus ?? 'RUNNING'
                  const now = Date.now()
                  // Emit progress when entering polling stage or every ~10 seconds while polling (0050)
                  if (lastStage !== 'polling' || now - lastProgressTime >= PROGRESS_INTERVAL) {
                    addProgress(`Agent is running (status: ${cursorStatus})...`)
                    lastProgressTime = now
                  }
                } else if (stage === 'completed') {
                  setImplAgentRunStatus('completed')
                  finalContent = data.content ?? 'Implementation completed.'
                  addProgress('Implementation completed successfully.')
                  
                  // Auto-move ticket to QA (0061)
                  const currentTicketId = implAgentTicketId || extractTicketId(finalContent) || extractTicketId(content)
                  if (currentTicketId) {
                    moveTicketToColumn(currentTicketId, 'col-qa', 'implementation').catch(() => {
                      // Error already logged via addAutoMoveDiagnostic
                    })
                  } else {
                    addAutoMoveDiagnostic(
                      `Implementation Agent completion: Could not determine ticket ID from message. Auto-move skipped.`,
                      'error'
                    )
                  }
                } else if (stage === 'failed') {
                  setImplAgentRunStatus('failed')
                  finalError = data.error ?? 'Unknown error'
                  setImplAgentError(finalError)
                  addProgress(`Implementation failed: ${finalError}`)
                }
              } catch {
                // skip malformed lines
              }
            }
          }

          if (finalContent) {
            // Add completion summary with label (0067)
            const agentType = cursorRunAgentType || 'implementation-agent'
            if (agentType === 'implementation-agent' || agentType === 'qa-agent') {
              addMessage(agentType, agentType, `**Completion summary**\n\n${finalContent}`)
            } else {
              // Missing agent type: show diagnostic and retain raw summary (0067)
              addAutoMoveDiagnostic(
                `Completion summary received but agent type is missing (expected 'implementation-agent' or 'qa-agent', got: ${agentType ?? 'null'}). Raw summary retained for troubleshooting.`,
                'error'
              )
              setOrphanedCompletionSummary(finalContent)
            }
            // Reset ticket ID after completion
            setImplAgentTicketId(null)
            setCursorRunAgentType(null)
          } else if (finalError) {
            addMessage(
              'implementation-agent',
              'implementation-agent',
              `[Implementation Agent] ${finalError}`
            )
          } else if (lastStage === 'failed') {
            const errorMsg = 'Request failed. Check that Cursor API is configured and the project has a GitHub remote.'
            setImplAgentError(errorMsg)
            addMessage(
              'implementation-agent',
              'implementation-agent',
              `[Implementation Agent] ${errorMsg}`
            )
          }
          setTimeout(() => setAgentTypingTarget(null), 500)
        } catch (err) {
          setImplAgentRunStatus('failed')
          const msg = err instanceof Error ? err.message : String(err)
          setImplAgentError(msg)
          addMessage('implementation-agent', 'implementation-agent', `[Implementation Agent] ${msg}`)
          setTimeout(() => setAgentTypingTarget(null), 500)
        }
      })()
    } else if (selectedChatTarget === 'qa-agent') {
      const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
      if (!cursorApiConfigured) {
        addMessage(
          'qa-agent',
          'qa-agent',
          '[QA Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
        )
        return
      }

      const isQaTicket = /qa\s+ticket\s+\d{4}/i.test(content)
      const ticketId = extractTicketId(content)
      if (ticketId) {
        setQaAgentTicketId(ticketId)
      }

      setAgentTypingTarget('qa-agent')
      setQaAgentRunStatus('preparing')
      // Track which agent initiated this run (0067)
      setCursorRunAgentType('qa-agent')
      setOrphanedCompletionSummary(null)

      ;(async () => {
        setQaAgentRunStatus(isQaTicket ? 'fetching_ticket' : 'preparing')
        try {
          const body: { message: string; supabaseUrl?: string; supabaseAnonKey?: string } = { message: content }
          if (supabaseUrl && supabaseAnonKey) {
            body.supabaseUrl = supabaseUrl
            body.supabaseAnonKey = supabaseAnonKey
          }
          const res = await fetch('/api/qa-agent/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (!res.body) {
            setQaAgentRunStatus('failed')
            addMessage(
              'qa-agent',
              'qa-agent',
              '[QA Agent] No response body from server.'
            )
            setTimeout(() => setAgentTypingTarget(null), 500)
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let lastStage = ''
          let finalContent = ''
          let finalError = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              try {
                const data = JSON.parse(trimmed) as {
                  stage?: string
                  cursorStatus?: string
                  success?: boolean
                  content?: string
                  error?: string
                  status?: string
                  verdict?: 'PASS' | 'FAIL'
                }
                const stage = data.stage ?? ''
                if (stage) lastStage = stage
                if (stage === 'fetching_ticket') setQaAgentRunStatus('fetching_ticket')
                else if (stage === 'fetching_branch') setQaAgentRunStatus('fetching_branch')
                else if (stage === 'launching') setQaAgentRunStatus('launching')
                else if (stage === 'polling') setQaAgentRunStatus('polling')
                else if (stage === 'generating_report') setQaAgentRunStatus('generating_report')
                else if (stage === 'merging') setQaAgentRunStatus('merging')
                else if (stage === 'moving_ticket') setQaAgentRunStatus('moving_ticket')
                else if (stage === 'completed') {
                  setQaAgentRunStatus('completed')
                  finalContent = data.content ?? 'QA completed.'
                  
                  // Auto-move ticket to Human in the Loop if PASS (0061)
                  const verdict = data.verdict
                  const isPass = verdict === 'PASS' || (data.success === true && verdict !== 'FAIL') || /pass|ok.*merge|verified.*main/i.test(finalContent)
                  if (isPass) {
                    const currentTicketId = qaAgentTicketId || extractTicketId(finalContent) || extractTicketId(content)
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
                  }
                } else if (stage === 'failed') {
                  setQaAgentRunStatus('failed')
                  finalError = data.error ?? 'Unknown error'
                }
              } catch {
                // skip malformed lines
              }
            }
          }

          if (finalContent) {
            // Add completion summary with label (0067)
            const agentType = cursorRunAgentType || 'qa-agent'
            if (agentType === 'implementation-agent' || agentType === 'qa-agent') {
              addMessage(agentType, agentType, `**Completion summary**\n\n${finalContent}`)
            } else {
              // Missing agent type: show diagnostic and retain raw summary (0067)
              addAutoMoveDiagnostic(
                `Completion summary received but agent type is missing (expected 'implementation-agent' or 'qa-agent', got: ${agentType ?? 'null'}). Raw summary retained for troubleshooting.`,
                'error'
              )
              setOrphanedCompletionSummary(finalContent)
            }
            
            // Auto-move ticket when QA completion message is detected (0061)
            // Check if this is a completion message with PASS verdict
            const isQaCompletion = /qa.*complete|qa.*report|qa.*pass|verdict.*pass|move.*human.*loop|verified.*main|pass.*ok.*merge/i.test(finalContent)
            if (isQaCompletion) {
              const verdict = /pass|ok.*merge|verified.*main|verdict.*pass/i.test(finalContent) && !/fail|verdict.*fail/i.test(finalContent)
              if (verdict) {
                const currentTicketId = qaAgentTicketId || extractTicketId(finalContent) || extractTicketId(content)
                if (currentTicketId) {
                  moveTicketToColumn(currentTicketId, 'col-human-in-the-loop', 'qa').catch(() => {
                    // Error already logged via addAutoMoveDiagnostic
                  })
                } else {
                  addAutoMoveDiagnostic(
                    `QA Agent completion (PASS): Could not determine ticket ID from completion message. Auto-move skipped.`,
                    'error'
                  )
                }
              }
            }
            
            // Reset ticket ID after completion
            setQaAgentTicketId(null)
            setCursorRunAgentType(null)
          } else if (finalError) {
            addMessage(
              'qa-agent',
              'qa-agent',
              `[QA Agent] ${finalError}`
            )
          } else if (lastStage === 'failed') {
            addMessage(
              'qa-agent',
              'qa-agent',
              '[QA Agent] Request failed. Check that Cursor API is configured and the project has a GitHub remote.'
            )
          }
          setTimeout(() => setAgentTypingTarget(null), 500)
        } catch (err) {
          setQaAgentRunStatus('failed')
          const msg = err instanceof Error ? err.message : String(err)
          addMessage('qa-agent', 'qa-agent', `[QA Agent] ${msg}`)
          setTimeout(() => setAgentTypingTarget(null), 500)
        }
      })()
    } else {
      // Standup: shared transcript across all agents
      setAgentTypingTarget('standup')
      setTimeout(() => {
        addMessage('standup', 'system', '--- Standup (all agents) ---')
      }, 100)
      setTimeout(() => {
        addMessage('standup', 'project-manager', `[Standup] Project Manager:
• Reviewed ticket backlog
• No blockers identified
• Ready to assist with prioritization`)
      }, 300)
      setTimeout(() => {
        addMessage('standup', 'implementation-agent', `[Standup] Implementation Agent:
• Awaiting task assignment
• Development environment ready
• No active work in progress`)
      }, 600)
      setTimeout(() => {
        addMessage('standup', 'system', '--- End of Standup ---')
        setAgentTypingTarget(null)
      }, 900)
    }
  }, [inputValue, selectedChatTarget, addMessage, conversations, pmLastResponseId, supabaseUrl, supabaseAnonKey, connectedProject, extractTicketId, moveTicketToColumn, implAgentTicketId, qaAgentTicketId, setImplAgentTicketId, setQaAgentTicketId, addAutoMoveDiagnostic])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleIframeLoad = useCallback(() => {
    setKanbanLoaded(true)
    setLastError(null)
  }, [])

  const handleIframeError = useCallback(() => {
    setKanbanLoaded(false)
    setLastError('Failed to load kanban board. Make sure the kanban app is running on ' + KANBAN_URL)
  }, [])

  /** Connect to project folder: pick folder, read .env, send credentials to kanban iframe */
  const handleConnectProjectFolder = useCallback(async () => {
    setConnectError(null)
    if (typeof window.showDirectoryPicker !== 'function') {
      setConnectError('Folder picker not supported in this browser.')
      return
    }
    try {
      const folderHandle = await window.showDirectoryPicker({ mode: 'read' })
      
      // Read .env file
      let envFile: FileSystemFileHandle
      try {
        envFile = await folderHandle.getFileHandle('.env')
      } catch {
        setConnectError('No .env file found in selected folder.')
        return
      }
      
      const file = await envFile.getFile()
      const envText = await file.text()
      
      // Parse .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
      const urlMatch = envText.match(/^VITE_SUPABASE_URL\s*=\s*(.+)$/m)
      const keyMatch = envText.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m)
      
      if (!urlMatch || !keyMatch) {
        setConnectError('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file.')
        return
      }
      // Strip optional surrounding single/double quotes (common in .env files)
      const stripQuotes = (s: string) => s.trim().replace(/^["']|["']$/g, '')
      const url = stripQuotes(urlMatch[1])
      const key = stripQuotes(keyMatch[1])
      if (!url || !key) {
        setConnectError('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must not be empty.')
        return
      }
      
      // Send credentials to kanban iframe via postMessage
      if (kanbanIframeRef.current?.contentWindow) {
        kanbanIframeRef.current.contentWindow.postMessage(
          { type: 'HAL_CONNECT_SUPABASE', url, key },
          KANBAN_URL
        )
        
        const projectName = folderHandle.name
        setSupabaseUrl(url)
        setSupabaseAnonKey(key)
        setProjectFolderHandle(folderHandle)
        setConnectedProject(projectName)
        setConnectError(null)
        setPmLastResponseId(null)

        // Load conversations: prefer project DB (Supabase), fallback to localStorage
        try {
          const supabase = createClient(url, key)
          const { data: rows, error } = await supabase
            .from('hal_conversation_messages')
            .select('role, content, sequence, created_at')
            .eq('project_id', projectName)
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
            setConversations({ ...getEmptyConversations(), [PM_AGENT_ID]: msgs })
            setPersistenceError(null)
          } else {
            throw new Error(error?.message ?? 'no rows')
          }
        } catch {
          const loadResult = loadConversationsFromStorage(projectName)
        if (loadResult.error) setPersistenceError(loadResult.error)
        else setPersistenceError(null)
        if (loadResult.data) {
          setConversations(loadResult.data)
          let maxId = 0
          for (const msgs of Object.values(loadResult.data)) {
            for (const msg of msgs) {
              if (msg.id > maxId) maxId = msg.id
            }
          }
          messageIdRef.current = maxId
        } else {
          setConversations(getEmptyConversations())
          messageIdRef.current = 0
        }
      }
        runUnassignedCheck(url, key, projectName).catch(() => {})
      } else {
        setConnectError('Kanban iframe not ready.')
      }
      
    } catch (e) {
      const err = e as { name?: string }
      if (err.name === 'AbortError') {
        return
      }
      setConnectError(err instanceof Error ? err.message : 'Failed to connect to project folder.')
    }
  }, [runUnassignedCheck])

  const handleDisconnect = useCallback(() => {
    if (kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_DISCONNECT' },
        KANBAN_URL
      )
    }
    setConversations(getEmptyConversations())
    messageIdRef.current = 0
    pmMaxSequenceRef.current = 0
    setPersistenceError(null)
    setConnectedProject(null)
    setProjectFolderHandle(null)
    setPmLastResponseId(null)
    setLastTicketCreationResult(null)
    setLastCreateTicketAvailable(null)
    setSupabaseUrl(null)
    setSupabaseAnonKey(null)
    setUnreadByTarget({ 'project-manager': 0, 'implementation-agent': 0, 'qa-agent': 0, standup: 0 })
    // Clear Implementation Agent state on disconnect (0050)
    setImplAgentRunStatus('idle')
    setImplAgentProgress([])
    setImplAgentError(null)
    setImplAgentTicketId(null)
    setQaAgentTicketId(null)
    setAutoMoveDiagnostics([])
    setCursorRunAgentType(null)
    setOrphanedCompletionSummary(null)
    try {
      localStorage.removeItem(IMPL_AGENT_STATUS_KEY)
      localStorage.removeItem(IMPL_AGENT_PROGRESS_KEY)
      localStorage.removeItem(IMPL_AGENT_ERROR_KEY)
    } catch {
      // ignore localStorage errors
    }
  }, [])

  const previousResponseIdInLastRequest =
    lastPmOutboundRequest != null &&
    typeof lastPmOutboundRequest === 'object' &&
    'previous_response_id' in lastPmOutboundRequest &&
    (lastPmOutboundRequest as { previous_response_id?: string }).previous_response_id != null

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
  }

  return (
    <div className="hal-app">
      <header className="hal-header">
        <h1>HAL</h1>
        <span className="hal-subtitle">Portfolio 2026 - Agent Workspace</span>
      </header>

      <main className="hal-main">
        {/* Left column: Kanban board */}
        <section className="hal-kanban-region" aria-label="Kanban board">
          <div className="kanban-header">
            <h2>Kanban Board</h2>
            <div className="kanban-header-actions">
              {!connectedProject ? (
                <button
                  type="button"
                  className="connect-project-btn"
                  onClick={handleConnectProjectFolder}
                >
                  Connect Project Folder
                </button>
              ) : (
                <div className="project-info">
                  <span className="project-name">{connectedProject}</span>
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
          {connectError && (
            <div className="connect-error" role="alert">
              {connectError}
            </div>
          )}
          {lastError && (
            <div className="connect-error" role="alert">
              {lastError}
            </div>
          )}
          <div className="kanban-frame-container">
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
        />

        {/* Right column: Chat UI */}
        <section className="hal-chat-region" aria-label="Chat" style={{ width: `${chatWidth}px` }}>
          <div className="chat-header">
            <h2>Chat</h2>
            <div className="agent-selector">
              <label htmlFor="agent-select">Agent:</label>
              <select
                id="agent-select"
                value={selectedChatTarget}
                onChange={(e) => {
                  const target = e.target.value as ChatTarget
                  setSelectedChatTarget(target)
                  setUnreadByTarget((prev) => ({ ...prev, [target]: 0 }))
                  // Don't reset status on navigation - persist it (0050)
                }}
                disabled={!connectedProject}
              >
                {(() => {
                  console.log('[DEBUG] Rendering dropdown with', CHAT_OPTIONS.length, 'options:', CHAT_OPTIONS.map(o => o.id));
                  return CHAT_OPTIONS.map((opt) => {
                    console.log('[DEBUG] Rendering option:', opt.id, opt.label);
                    return (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                        {unreadByTarget[opt.id] > 0 ? ` (${unreadByTarget[opt.id]})` : ''}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          </div>

          {!connectedProject ? (
            <div className="chat-placeholder">
              <p className="chat-placeholder-text">Connect a project to enable chat</p>
              <p className="chat-placeholder-hint">
                Use the "Connect Project Folder" button above to connect a project and start chatting with agents.
              </p>
            </div>
          ) : (
            <>
              {selectedChatTarget === 'implementation-agent' && (
                <>
                  <div className="agent-stub-banner" role="status">
                    <p className="agent-stub-title">Implementation Agent — Cursor Cloud Agents</p>
                    <p className="agent-stub-hint">
                      {import.meta.env.VITE_CURSOR_API_KEY
                        ? 'Say "Implement ticket XXXX" (e.g. Implement ticket 0046) to fetch the ticket, launch a Cursor cloud agent, and move the ticket to QA when done.'
                        : 'Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable.'}
                    </p>
                  </div>
                  {/* Persistent status panel (0050) */}
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
              {selectedChatTarget === 'qa-agent' && (
                <div className="agent-stub-banner" role="status">
                  <p className="agent-stub-title">QA Agent — Cursor Cloud Agents</p>
                  <p className="agent-stub-hint">
                    {import.meta.env.VITE_CURSOR_API_KEY
                      ? 'Say "QA ticket XXXX" (e.g. QA ticket 0046) to review the ticket implementation, generate a QA report, and merge to main if it passes.'
                      : 'Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable.'}
                  </p>
                </div>
              )}
              <div className="chat-transcript" ref={transcriptRef}>
                {activeMessages.length === 0 && !agentTypingTarget ? (
                  <p className="transcript-empty">No messages yet. Start a conversation.</p>
                ) : (
                  <>
                    {activeMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`message-row message-row-${msg.agent}`}
                        data-agent={msg.agent}
                      >
                        <div className={`message message-${msg.agent}`}>
                          <div className="message-header">
                            <span className="message-author">{getMessageAuthorLabel(msg.agent)}</span>
                            <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                          </div>
                          {msg.content.trimStart().startsWith('{') ? (
                            <pre className="message-content message-json">{msg.content}</pre>
                          ) : (
                            <span className="message-content">{msg.content}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {agentTypingTarget === selectedChatTarget && (
                      <div className="message-row message-row-typing" data-agent="typing" aria-live="polite">
                        <div className="message message-typing">
                          <div className="message-header">
                            <span className="message-author">HAL</span>
                          </div>
                          {selectedChatTarget === 'implementation-agent' ? (
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
                          ) : selectedChatTarget === 'qa-agent' ? (
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

              <div className="chat-composer">
                <textarea
                  className="message-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send)"
                  rows={2}
                />
                <div className="composer-actions">
                  <button type="button" className="send-btn" onClick={handleSend}>
                    Send
                  </button>
                </div>
              </div>
            </>
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
                  <span className="diag-label">Connected project:</span>
                  <span className="diag-value">
                    {diagnostics.connectedProject ?? 'none'}
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

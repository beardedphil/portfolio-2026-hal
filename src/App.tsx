import { useState, useCallback, useRef, useEffect } from 'react'

type Agent = 'project-manager' | 'implementation-agent'
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

type PmAgentResponse = {
  reply: string
  toolCalls: ToolCallRecord[]
  outboundRequest: object | null
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
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
  persistenceError: string | null
}

// localStorage helpers for conversation persistence
const CONVERSATION_STORAGE_PREFIX = 'hal-chat-conversations-'

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
    standup: [],
  }
}

const CHAT_OPTIONS: { id: ChatTarget; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent (stub)' },
  { id: 'standup', label: 'Standup (all agents)' },
]

const KANBAN_URL = 'http://localhost:5174'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
  const [outboundRequestExpanded, setOutboundRequestExpanded] = useState(false)
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false)
  const messageIdRef = useRef(0)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const kanbanIframeRef = useRef<HTMLIFrameElement>(null)

  const activeMessages = conversations[selectedChatTarget] ?? []

  // Auto-scroll transcript to bottom when messages change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [activeMessages])

  // Persist conversations to localStorage whenever they change (if project connected)
  useEffect(() => {
    if (!connectedProject) return
    const result = saveConversationsToStorage(connectedProject, conversations)
    if (!result.success && result.error) {
      setPersistenceError(result.error)
    } else {
      setPersistenceError(null)
    }
  }, [conversations, connectedProject])

  const addMessage = useCallback((target: ChatTarget, agent: Message['agent'], content: string) => {
    const id = ++messageIdRef.current
    setConversations((prev) => ({
      ...prev,
      [target]: [...(prev[target] ?? []), { id, agent, content, timestamp: new Date() }],
    }))
  }, [])

  const handleSend = useCallback(() => {
    const content = inputValue.trim()
    if (!content) return

    addMessage(selectedChatTarget, 'user', content)
    setInputValue('')
    setLastAgentError(null)

    if (selectedChatTarget === 'project-manager') {
      setLastAgentError(null)
      setOpenaiLastError(null)
      setLastPmOutboundRequest(null)
      setLastPmToolCalls(null)
      ;(async () => {
        try {
          const res = await fetch('/api/pm/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: content }),
          })
          setOpenaiLastStatus(String(res.status))
          const text = await res.text()
          
          let data: PmAgentResponse
          try {
            data = JSON.parse(text) as PmAgentResponse
          } catch {
            setOpenaiLastError('Invalid JSON response from PM endpoint')
            setLastAgentError('Invalid JSON response')
            addMessage('project-manager', 'project-manager', `[PM] Error: Invalid response format`)
            return
          }

          // Store diagnostics data
          setLastPmOutboundRequest(data.outboundRequest)
          setLastPmToolCalls(data.toolCalls?.length ? data.toolCalls : null)

          if (!res.ok || data.error) {
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
          
          // Display the PM's reply
          const reply = data.reply || '[PM] (No response)'
          addMessage('project-manager', 'project-manager', reply)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setOpenaiLastStatus(null)
          setOpenaiLastError(msg)
          setLastAgentError(msg)
          addMessage('project-manager', 'project-manager', `[PM] Error: ${msg}`)
        }
      })()
    } else if (selectedChatTarget === 'implementation-agent') {
      setTimeout(() => {
        const agentLabel = CHAT_OPTIONS.find((a) => a.id === selectedChatTarget)?.label ?? selectedChatTarget
        addMessage('implementation-agent', 'implementation-agent', `[${agentLabel}] This is a stub response. Real agent infrastructure is not implemented yet.`)
      }, 500)
    } else {
      // Standup: shared transcript across all agents
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
        addMessage('standup', 'implementation-agent', `[Standup] Implementation Agent (stub):
• Awaiting task assignment
• Development environment ready
• No active work in progress`)
      }, 600)
      setTimeout(() => {
        addMessage('standup', 'system', '--- End of Standup ---')
      }, 900)
    }
  }, [inputValue, selectedChatTarget, addMessage])

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
      
      const url = urlMatch[1].trim()
      const key = keyMatch[1].trim()
      
      // Send credentials to kanban iframe via postMessage
      if (kanbanIframeRef.current?.contentWindow) {
        kanbanIframeRef.current.contentWindow.postMessage(
          { type: 'HAL_CONNECT_SUPABASE', url, key },
          KANBAN_URL
        )
        
        // Load saved conversations for this project
        const projectName = folderHandle.name
        const loadResult = loadConversationsFromStorage(projectName)
        if (loadResult.error) {
          setPersistenceError(loadResult.error)
        } else {
          setPersistenceError(null)
        }
        if (loadResult.data) {
          setConversations(loadResult.data)
          // Find the max message ID from loaded conversations to avoid ID collisions
          let maxId = 0
          for (const msgs of Object.values(loadResult.data)) {
            for (const msg of msgs) {
              if (msg.id > maxId) maxId = msg.id
            }
          }
          messageIdRef.current = maxId
        } else {
          // No saved conversations, start fresh
          setConversations(getEmptyConversations())
          messageIdRef.current = 0
        }
        
        setConnectedProject(projectName)
        setConnectError(null)
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
  }, [])

  const handleDisconnect = useCallback(() => {
    if (kanbanIframeRef.current?.contentWindow) {
      kanbanIframeRef.current.contentWindow.postMessage(
        { type: 'HAL_DISCONNECT' },
        KANBAN_URL
      )
    }
    // Clear conversations when disconnecting (they're already persisted)
    setConversations(getEmptyConversations())
    messageIdRef.current = 0
    setPersistenceError(null)
    setConnectedProject(null)
  }, [])

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
    persistenceError,
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
              <span className="kanban-status" data-loaded={kanbanLoaded}>
                {kanbanLoaded ? 'Connected' : 'Loading...'}
              </span>
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

        {/* Right column: Chat UI */}
        <section className="hal-chat-region" aria-label="Chat">
          <div className="chat-header">
            <h2>Chat</h2>
            <div className="agent-selector">
              <label htmlFor="agent-select">Agent:</label>
              <select
                id="agent-select"
                value={selectedChatTarget}
                onChange={(e) => setSelectedChatTarget(e.target.value as ChatTarget)}
                disabled={!connectedProject}
              >
                {CHAT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
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
              <div className="chat-transcript" ref={transcriptRef}>
                {activeMessages.length === 0 ? (
                  <p className="transcript-empty">No messages yet. Start a conversation.</p>
                ) : (
                  activeMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`message message-${msg.agent}`}
                      data-agent={msg.agent}
                    >
                      <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                      {msg.content.trimStart().startsWith('{') ? (
                        <pre className="message-content message-json">{msg.content}</pre>
                      ) : (
                        <span className="message-content">{msg.content}</span>
                      )}
                    </div>
                  ))
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
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

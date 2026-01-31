import { useState, useCallback, useRef, useEffect } from 'react'

type Agent = 'project-manager' | 'implementation-agent'

type Message = {
  id: number
  agent: Agent | 'user' | 'system'
  content: string
  timestamp: Date
}

type DiagnosticsInfo = {
  kanbanRenderMode: string
  selectedAgent: Agent
  lastError: string | null
  kanbanLoaded: boolean
  kanbanUrl: string
}

const AGENT_OPTIONS: { id: Agent; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent (stub)' },
]

const KANBAN_URL = 'http://localhost:5174'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function App() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>('project-manager')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [lastError, setLastError] = useState<string | null>(null)
  const [kanbanLoaded, setKanbanLoaded] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const messageIdRef = useRef(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Auto-scroll transcript to bottom when messages change
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages])

  const addMessage = useCallback((agent: Message['agent'], content: string) => {
    const id = ++messageIdRef.current
    setMessages((prev) => [
      ...prev,
      { id, agent, content, timestamp: new Date() },
    ])
  }, [])

  const handleSend = useCallback(() => {
    const content = inputValue.trim()
    if (!content) return
    
    addMessage('user', content)
    setInputValue('')
    
    // Stub agent response (no real LLM integration yet)
    setTimeout(() => {
      const agentLabel = AGENT_OPTIONS.find((a) => a.id === selectedAgent)?.label ?? selectedAgent
      addMessage(selectedAgent, `[${agentLabel}] This is a stub response. Real agent infrastructure is not implemented yet.`)
    }, 500)
  }, [inputValue, selectedAgent, addMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleStandup = useCallback(() => {
    addMessage('system', '--- Standup (all agents) ---')
    
    // Placeholder standup updates from each agent
    setTimeout(() => {
      addMessage('project-manager', `[Standup] Project Manager:
• Reviewed ticket backlog
• No blockers identified
• Ready to assist with prioritization`)
    }, 300)
    
    setTimeout(() => {
      addMessage('implementation-agent', `[Standup] Implementation Agent (stub):
• Awaiting task assignment
• Development environment ready
• No active work in progress`)
    }, 600)
    
    setTimeout(() => {
      addMessage('system', '--- End of Standup ---')
    }, 900)
  }, [addMessage])

  const handleIframeLoad = useCallback(() => {
    setKanbanLoaded(true)
    setLastError(null)
  }, [])

  const handleIframeError = useCallback(() => {
    setKanbanLoaded(false)
    setLastError('Failed to load kanban board. Make sure the kanban app is running on ' + KANBAN_URL)
  }, [])

  const diagnostics: DiagnosticsInfo = {
    kanbanRenderMode: 'iframe (fallback)',
    selectedAgent,
    lastError,
    kanbanLoaded,
    kanbanUrl: KANBAN_URL,
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
            <span className="kanban-status" data-loaded={kanbanLoaded}>
              {kanbanLoaded ? 'Connected' : 'Loading...'}
            </span>
          </div>
          <div className="kanban-frame-container">
            <iframe
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
                  Start the kanban app: <code>cd projects/kanban && npm run dev</code>
                </p>
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
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value as Agent)}
              >
                {AGENT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="chat-transcript" ref={transcriptRef}>
            {messages.length === 0 ? (
              <p className="transcript-empty">No messages yet. Start a conversation or run a standup.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message message-${msg.agent}`}
                  data-agent={msg.agent}
                >
                  <span className="message-time">[{formatTime(msg.timestamp)}]</span>
                  <span className="message-content">{msg.content}</span>
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
              <button type="button" className="standup-btn" onClick={handleStandup}>
                Standup (all agents)
              </button>
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
                  <span className="diag-label">Selected agent:</span>
                  <span className="diag-value">{diagnostics.selectedAgent}</span>
                </div>
                <div className="diag-row">
                  <span className="diag-label">Last error:</span>
                  <span className="diag-value" data-status={diagnostics.lastError ? 'error' : 'ok'}>
                    {diagnostics.lastError ?? 'none'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

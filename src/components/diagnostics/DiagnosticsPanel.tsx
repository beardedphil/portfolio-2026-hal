import React from 'react'
import type { DiagnosticsInfo, ChatTarget } from './types'
import { PmDiagnosticsSections } from './PmDiagnosticsSections'

type DiagnosticsPanelProps = {
  diagnostics: DiagnosticsInfo
  diagnosticsOpen: boolean
  setDiagnosticsOpen: (open: boolean) => void
  selectedChatTarget: ChatTarget
  chatWidth: number
  isDragging: boolean
  lastWorkButtonClick: { eventId: string; timestamp: Date; chatTarget: ChatTarget } | null
  outboundRequestExpanded: boolean
  setOutboundRequestExpanded: (expanded: boolean) => void
  toolCallsExpanded: boolean
  setToolCallsExpanded: (expanded: boolean) => void
  formatTime: (date: Date) => string
}

export function DiagnosticsPanel({
  diagnostics,
  diagnosticsOpen,
  setDiagnosticsOpen,
  selectedChatTarget,
  chatWidth,
  isDragging,
  lastWorkButtonClick,
  outboundRequestExpanded,
  setOutboundRequestExpanded,
  toolCallsExpanded,
  setToolCallsExpanded,
  formatTime,
}: DiagnosticsPanelProps) {
  return (
    <>
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
          {diagnostics.conversationHistoryResetMessage && (
            <div className="diag-row">
              <span className="diag-label">Conversation history:</span>
              <span className="diag-value" data-status="error" style={{ color: 'var(--hal-status-error, #c62828)', fontWeight: '500' }}>
                {diagnostics.conversationHistoryResetMessage}
              </span>
            </div>
          )}
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

          {/* PM Diagnostics Sections */}
          <PmDiagnosticsSections
            diagnostics={diagnostics}
            selectedChatTarget={selectedChatTarget}
            outboundRequestExpanded={outboundRequestExpanded}
            setOutboundRequestExpanded={setOutboundRequestExpanded}
            toolCallsExpanded={toolCallsExpanded}
            setToolCallsExpanded={setToolCallsExpanded}
          />

          {/* Auto-move diagnostics */}
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
        </div>
      )}
    </>
  )
}

import type { DiagnosticsInfo, WorkingMemory } from './types'
import { PmWorkingMemoryPanel } from './PmWorkingMemoryPanel'

type PmDiagnosticsSectionProps = {
  diagnostics: DiagnosticsInfo
  outboundRequestExpanded: boolean
  onToggleOutboundRequest: () => void
  toolCallsExpanded: boolean
  onToggleToolCalls: () => void
  pmWorkingMemoryOpen: boolean
  onTogglePmWorkingMemory: () => void
  onRefreshPmWorkingMemory: () => void
  workingMemory: WorkingMemory | null
  workingMemoryLoading: boolean
  workingMemoryError: string | null
}

export function PmDiagnosticsSection({
  diagnostics,
  outboundRequestExpanded,
  onToggleOutboundRequest,
  toolCallsExpanded,
  onToggleToolCalls,
  pmWorkingMemoryOpen,
  onTogglePmWorkingMemory,
  onRefreshPmWorkingMemory,
  workingMemory,
  workingMemoryLoading,
  workingMemoryError,
}: PmDiagnosticsSectionProps) {
  const selectedChatTarget = diagnostics.selectedChatTarget

  if (selectedChatTarget !== 'project-manager') {
    return null
  }

  return (
    <>
      {/* PM Diagnostics: Outbound Request */}
      <div className="diag-section">
        <button
          type="button"
          className="diag-section-toggle"
          onClick={onToggleOutboundRequest}
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

      {/* PM Diagnostics: Tool Calls */}
      <div className="diag-section">
        <button
          type="button"
          className="diag-section-toggle"
          onClick={onToggleToolCalls}
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

      {/* PM Working Memory (0173) */}
      <div className="diag-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="diag-section-toggle"
            onClick={onTogglePmWorkingMemory}
            aria-expanded={pmWorkingMemoryOpen}
          >
            PM Working Memory {pmWorkingMemoryOpen ? '▼' : '▶'}
          </button>
          <button
            type="button"
            onClick={onRefreshPmWorkingMemory}
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
        {pmWorkingMemoryOpen && (
          <div className="diag-section-content">
            <PmWorkingMemoryPanel
              workingMemoryOpen={true}
              onToggle={() => {}}
              onRefresh={onRefreshPmWorkingMemory}
              workingMemory={workingMemory}
              loading={workingMemoryLoading}
              error={workingMemoryError}
            />
          </div>
        )}
      </div>

      {/* PM Diagnostics: Create ticket availability (0011) */}
      {diagnostics.lastCreateTicketAvailable != null && (
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
      {diagnostics.lastTicketCreationResult && (
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
      {diagnostics.lastPmToolCalls && (() => {
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
                    <div><strong>Detected placeholders:</strong> <code>{output.detectedPlaceholders.join(', ')}</code></div>
                  )}
                  {output.error && (
                    <div className="diag-readiness-error"><strong>Error message:</strong> {output.error}</div>
                  )}
                </div>
              ) : isSuccess && hasReadiness ? (
                <div className="diag-ticket-readiness">
                  <div><strong>Status:</strong> {output.ready ? <span className="diag-sync-ok">PASS</span> : <span className="diag-sync-error">FAIL</span>}</div>
                  {output.missingItems && Array.isArray(output.missingItems) && output.missingItems.length > 0 && (
                    <div>
                      <strong>Missing items:</strong>
                      <ul style={{ marginTop: '0.5em', marginBottom: '0.5em', paddingLeft: '1.5em' }}>
                        {output.missingItems.map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )
      })()}
    </>
  )
}

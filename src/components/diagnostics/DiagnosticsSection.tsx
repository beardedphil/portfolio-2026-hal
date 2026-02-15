import { DiagnosticsPanel } from './DiagnosticsPanel'
import { PmWorkingMemoryPanel } from './PmWorkingMemoryPanel'
import type { DiagnosticsInfo, WorkingMemory } from './types'

type DiagnosticsSectionProps = {
  diagnostics: DiagnosticsInfo
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
  chatWidth: number
  isDragging: boolean
  lastWorkButtonClick: { eventId: string; timestamp: Date; chatTarget: string; message: string } | null
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
  // Standalone PM Working Memory panel (outside diagnostics)
  standaloneWorkingMemoryOpen: boolean
  onToggleStandaloneWorkingMemory: () => void
  onFetchWorkingMemory: () => void
  onRefreshStandaloneWorkingMemory: () => void
}

export function DiagnosticsSection({
  diagnostics,
  diagnosticsOpen,
  onToggleDiagnostics,
  chatWidth,
  isDragging,
  lastWorkButtonClick,
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
  standaloneWorkingMemoryOpen,
  onToggleStandaloneWorkingMemory,
  onFetchWorkingMemory,
  onRefreshStandaloneWorkingMemory,
}: DiagnosticsSectionProps) {
  const selectedChatTarget = diagnostics.selectedChatTarget

  return (
    <div className="diagnostics-section">
      <button
        type="button"
        className="diagnostics-toggle"
        onClick={onToggleDiagnostics}
        aria-expanded={diagnosticsOpen}
      >
        Diagnostics {diagnosticsOpen ? '▼' : '▶'}
      </button>
      
      {/* Standalone Working Memory Panel (0173) - outside diagnostics */}
      {selectedChatTarget === 'project-manager' && (
        <button
          type="button"
          className="diagnostics-toggle"
          onClick={() => {
            onToggleStandaloneWorkingMemory()
            if (!standaloneWorkingMemoryOpen && !workingMemory && !workingMemoryLoading) {
              onFetchWorkingMemory()
            }
          }}
          aria-expanded={standaloneWorkingMemoryOpen}
        >
          PM Working Memory {standaloneWorkingMemoryOpen ? '▼' : '▶'}
        </button>
      )}
      
      {standaloneWorkingMemoryOpen && selectedChatTarget === 'project-manager' && (
        <PmWorkingMemoryPanel
          workingMemoryOpen={true}
          onToggle={() => {}}
          onRefresh={onRefreshStandaloneWorkingMemory}
          workingMemory={workingMemory}
          loading={workingMemoryLoading}
          error={workingMemoryError}
        />
      )}
      
      {diagnosticsOpen && (
        <DiagnosticsPanel
          diagnostics={diagnostics}
          diagnosticsOpen={true}
          chatWidth={chatWidth}
          isDragging={isDragging}
          lastWorkButtonClick={lastWorkButtonClick}
          outboundRequestExpanded={outboundRequestExpanded}
          onToggleOutboundRequest={onToggleOutboundRequest}
          toolCallsExpanded={toolCallsExpanded}
          onToggleToolCalls={onToggleToolCalls}
          pmWorkingMemoryOpen={pmWorkingMemoryOpen}
          onTogglePmWorkingMemory={onTogglePmWorkingMemory}
          onRefreshPmWorkingMemory={onRefreshPmWorkingMemory}
          workingMemory={workingMemory}
          workingMemoryLoading={workingMemoryLoading}
          workingMemoryError={workingMemoryError}
        />
      )}
    </div>
  )
}

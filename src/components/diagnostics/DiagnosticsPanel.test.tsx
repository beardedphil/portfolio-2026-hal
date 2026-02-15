import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import type { DiagnosticsInfo, ChatTarget } from './types'

describe('DiagnosticsPanel', () => {
  const mockDiagnostics: DiagnosticsInfo = {
    kanbanRenderMode: 'library',
    kanbanBuild: 'test-build',
    selectedChatTarget: 'project-manager' as ChatTarget,
    pmImplementationSource: 'hal-agents',
    lastAgentError: null,
    lastError: null,
    openaiLastStatus: null,
    openaiLastError: null,
    kanbanLoaded: true,
    kanbanUrl: 'library',
    connectedProject: 'test/repo',
    lastPmOutboundRequest: null,
    lastPmToolCalls: null,
    lastTicketCreationResult: null,
    lastCreateTicketAvailable: null,
    persistenceError: null,
    pmLastResponseId: null,
    previousResponseIdInLastRequest: false,
    agentRunner: null,
    autoMoveDiagnostics: [],
    theme: 'light',
    themeSource: 'default',
    lastSendPayloadSummary: null,
    repoInspectionAvailable: true,
    unitTestsConfigured: true,
    conversationHistoryResetMessage: null,
  }

  it('renders diagnostics toggle button', () => {
    const mockSetDiagnosticsOpen = vi.fn()
    render(
      <DiagnosticsPanel
        diagnostics={mockDiagnostics}
        diagnosticsOpen={false}
        setDiagnosticsOpen={mockSetDiagnosticsOpen}
        selectedChatTarget="project-manager"
        chatWidth={400}
        isDragging={false}
        lastWorkButtonClick={null}
        outboundRequestExpanded={false}
        setOutboundRequestExpanded={vi.fn()}
        toolCallsExpanded={false}
        setToolCallsExpanded={vi.fn()}
        formatTime={(date: Date) => date.toLocaleTimeString()}
      />
    )

    const toggleButton = screen.getByText(/Diagnostics/)
    expect(toggleButton).toBeInTheDocument()
  })

  it('toggles diagnostics panel when button is clicked', () => {
    const mockSetDiagnosticsOpen = vi.fn()
    render(
      <DiagnosticsPanel
        diagnostics={mockDiagnostics}
        diagnosticsOpen={false}
        setDiagnosticsOpen={mockSetDiagnosticsOpen}
        selectedChatTarget="project-manager"
        chatWidth={400}
        isDragging={false}
        lastWorkButtonClick={null}
        outboundRequestExpanded={false}
        setOutboundRequestExpanded={vi.fn()}
        toolCallsExpanded={false}
        setToolCallsExpanded={vi.fn()}
        formatTime={(date: Date) => date.toLocaleTimeString()}
      />
    )

    const toggleButton = screen.getByText(/Diagnostics/)
    fireEvent.click(toggleButton)
    expect(mockSetDiagnosticsOpen).toHaveBeenCalledWith(true)
  })

  it('shows diagnostics panel content when open', () => {
    const mockSetDiagnosticsOpen = vi.fn()
    render(
      <DiagnosticsPanel
        diagnostics={mockDiagnostics}
        diagnosticsOpen={true}
        setDiagnosticsOpen={mockSetDiagnosticsOpen}
        selectedChatTarget="project-manager"
        chatWidth={400}
        isDragging={false}
        lastWorkButtonClick={null}
        outboundRequestExpanded={false}
        setOutboundRequestExpanded={vi.fn()}
        toolCallsExpanded={false}
        setToolCallsExpanded={vi.fn()}
        formatTime={(date: Date) => date.toLocaleTimeString()}
      />
    )

    expect(screen.getByText(/Chat target:/)).toBeInTheDocument()
    expect(screen.getByText(/project-manager/)).toBeInTheDocument()
  })

  it('displays diagnostics values correctly', () => {
    const mockSetDiagnosticsOpen = vi.fn()
    render(
      <DiagnosticsPanel
        diagnostics={mockDiagnostics}
        diagnosticsOpen={true}
        setDiagnosticsOpen={mockSetDiagnosticsOpen}
        selectedChatTarget="project-manager"
        chatWidth={400}
        isDragging={false}
        lastWorkButtonClick={null}
        outboundRequestExpanded={false}
        setOutboundRequestExpanded={vi.fn()}
        toolCallsExpanded={false}
        setToolCallsExpanded={vi.fn()}
        formatTime={(date: Date) => date.toLocaleTimeString()}
      />
    )

    expect(screen.getByText(/Kanban render mode:/)).toBeInTheDocument()
    expect(screen.getByText(/Kanban build:/)).toBeInTheDocument()
    // Check that the values are present (may appear multiple times, so use getAllByText)
    const libraryTexts = screen.getAllByText(/library/)
    expect(libraryTexts.length).toBeGreaterThan(0)
    expect(screen.getByText('test-build')).toBeInTheDocument()
  })
})

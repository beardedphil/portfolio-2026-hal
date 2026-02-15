import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import type { DiagnosticsInfo } from './types'

describe('DiagnosticsPanel', () => {
  const mockDiagnostics: DiagnosticsInfo = {
    kanbanRenderMode: 'library',
    kanbanBuild: 'test-build',
    selectedChatTarget: 'project-manager',
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

  const defaultProps = {
    diagnostics: mockDiagnostics,
    diagnosticsOpen: false,
    chatWidth: 400,
    isDragging: false,
    lastWorkButtonClick: null,
    outboundRequestExpanded: false,
    onToggleOutboundRequest: vi.fn(),
    toolCallsExpanded: false,
    onToggleToolCalls: vi.fn(),
    pmWorkingMemoryOpen: false,
    onTogglePmWorkingMemory: vi.fn(),
    onRefreshPmWorkingMemory: vi.fn(),
    workingMemory: null,
    workingMemoryLoading: false,
    workingMemoryError: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })



  it('renders diagnostics panel content when open', () => {
    render(<DiagnosticsPanel {...defaultProps} diagnosticsOpen={true} />)
    
    expect(screen.getByRole('region', { name: /diagnostics/i })).toBeInTheDocument()
    expect(screen.getByText(/chat width \(px\):/i)).toBeInTheDocument()
    expect(screen.getByText(/^theme:$/i)).toBeInTheDocument()
  })

  it('does not render diagnostics panel content when closed', () => {
    render(<DiagnosticsPanel {...defaultProps} diagnosticsOpen={false} />)
    
    expect(screen.queryByRole('region', { name: /diagnostics/i })).not.toBeInTheDocument()
  })

  it('displays PM Working Memory section only for project-manager chat target', () => {
    const pmDiagnostics = { ...mockDiagnostics, selectedChatTarget: 'project-manager' as const }
    render(<DiagnosticsPanel {...defaultProps} diagnostics={pmDiagnostics} diagnosticsOpen={true} pmWorkingMemoryOpen={true} />)
    
    expect(screen.getByRole('button', { name: /^pm working memory/i })).toBeInTheDocument()
  })

  it('does not display PM Working Memory section for non-PM chat targets', () => {
    const implDiagnostics = { ...mockDiagnostics, selectedChatTarget: 'implementation-agent' as const }
    render(<DiagnosticsPanel {...defaultProps} diagnostics={implDiagnostics} diagnosticsOpen={true} />)
    
    expect(screen.queryByText(/pm working memory/i)).not.toBeInTheDocument()
  })
})

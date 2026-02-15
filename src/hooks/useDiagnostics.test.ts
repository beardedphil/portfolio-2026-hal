import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDiagnostics } from './useDiagnostics'
import type { ChatTarget, Theme } from '../components/diagnostics/types'

describe('useDiagnostics', () => {
  const baseParams = {
    selectedChatTarget: 'project-manager' as ChatTarget,
    lastAgentError: null as string | null,
    lastError: null as string | null,
    openaiLastStatus: null as string | null,
    openaiLastError: null as string | null,
    connectedProject: 'test/repo' as string | null,
    lastPmOutboundRequest: null as object | null,
    lastPmToolCalls: null as any,
    lastTicketCreationResult: null as any,
    lastCreateTicketAvailable: null as boolean | null,
    persistenceError: null as string | null,
    pmLastResponseId: null as string | null,
    previousResponseIdInLastRequest: false,
    agentRunner: null as string | null,
    autoMoveDiagnostics: [] as Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>,
    theme: 'light' as Theme,
    themeSource: 'default' as const,
    lastSendPayloadSummary: null as string | null,
    connectedGithubRepo: { fullName: 'test/repo', defaultBranch: 'main', htmlUrl: 'https://github.com/test/repo', private: false },
    conversationHistoryResetMessage: null as string | null,
    kanbanBuild: 'test-build',
  }

  it('constructs diagnostics object with correct structure', () => {
    const { result } = renderHook(() => useDiagnostics(baseParams))
    
    expect(result.current).toHaveProperty('kanbanRenderMode')
    expect(result.current).toHaveProperty('selectedChatTarget')
    expect(result.current).toHaveProperty('pmImplementationSource')
    expect(result.current).toHaveProperty('kanbanLoaded')
    expect(result.current).toHaveProperty('kanbanUrl')
    expect(result.current).toHaveProperty('kanbanBuild')
  })

  it('sets pmImplementationSource to hal-agents for project-manager', () => {
    const { result } = renderHook(() => useDiagnostics({
      ...baseParams,
      selectedChatTarget: 'project-manager' as ChatTarget,
    }))
    
    expect(result.current.pmImplementationSource).toBe('hal-agents')
  })

  it('sets pmImplementationSource to inline for non-PM targets', () => {
    const { result } = renderHook(() => useDiagnostics({
      ...baseParams,
      selectedChatTarget: 'implementation-agent' as ChatTarget,
    }))
    
    expect(result.current.pmImplementationSource).toBe('inline')
  })

  it('sets repoInspectionAvailable based on connectedGithubRepo', () => {
    const { result: resultWithRepo } = renderHook(() => useDiagnostics({
      ...baseParams,
      connectedGithubRepo: { fullName: 'test/repo', defaultBranch: 'main', htmlUrl: 'https://github.com/test/repo', private: false },
    }))
    
    expect(resultWithRepo.current.repoInspectionAvailable).toBe(true)

    const { result: resultWithoutRepo } = renderHook(() => useDiagnostics({
      ...baseParams,
      connectedGithubRepo: null,
    }))
    
    expect(resultWithoutRepo.current.repoInspectionAvailable).toBe(false)
  })

  it('includes all required diagnostics fields', () => {
    const { result } = renderHook(() => useDiagnostics(baseParams))
    
    const diagnostics = result.current
    expect(diagnostics.kanbanRenderMode).toBe('library')
    expect(diagnostics.kanbanBuild).toBe('test-build')
    expect(diagnostics.kanbanLoaded).toBe(true)
    expect(diagnostics.kanbanUrl).toBe('library')
    expect(diagnostics.unitTestsConfigured).toBe(true)
    expect(diagnostics.theme).toBe('light')
    expect(diagnostics.themeSource).toBe('default')
  })

  it('preserves error states', () => {
    const { result } = renderHook(() => useDiagnostics({
      ...baseParams,
      lastAgentError: 'Test agent error',
      lastError: 'Test error',
      openaiLastError: 'Test OpenAI error',
    }))
    
    expect(result.current.lastAgentError).toBe('Test agent error')
    expect(result.current.lastError).toBe('Test error')
    expect(result.current.openaiLastError).toBe('Test OpenAI error')
  })

  it('preserves autoMoveDiagnostics', () => {
    const autoMoveEntries = [
      { timestamp: new Date(), message: 'Test message', type: 'info' as const },
    ]
    const { result } = renderHook(() => useDiagnostics({
      ...baseParams,
      autoMoveDiagnostics: autoMoveEntries,
    }))
    
    expect(result.current.autoMoveDiagnostics).toEqual(autoMoveEntries)
  })
})

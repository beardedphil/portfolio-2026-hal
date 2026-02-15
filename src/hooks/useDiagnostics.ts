import { useMemo } from 'react'
import type { DiagnosticsInfo, ChatTarget, Theme } from '../components/diagnostics/types'

type UseDiagnosticsParams = {
  selectedChatTarget: ChatTarget
  lastAgentError: string | null
  lastError: string | null
  openaiLastStatus: string | null
  openaiLastError: string | null
  connectedProject: string | null
  lastPmOutboundRequest: object | null
  lastPmToolCalls: any
  lastTicketCreationResult: any
  lastCreateTicketAvailable: boolean | null
  persistenceError: string | null
  pmLastResponseId: string | null
  previousResponseIdInLastRequest: boolean
  agentRunner: string | null
  autoMoveDiagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>
  theme: Theme
  themeSource: 'default' | 'saved'
  lastSendPayloadSummary: string | null
  connectedGithubRepo: { fullName: string; defaultBranch: string; htmlUrl: string; private: boolean } | null
  conversationHistoryResetMessage: string | null
  kanbanBuild: string
}

export function useDiagnostics(params: UseDiagnosticsParams): DiagnosticsInfo {
  return useMemo(() => {
    const {
      selectedChatTarget,
      lastAgentError,
      lastError,
      openaiLastStatus,
      openaiLastError,
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
      connectedGithubRepo,
      conversationHistoryResetMessage,
      kanbanBuild,
    } = params

    return {
      kanbanRenderMode: 'library',
      kanbanBuild,
      selectedChatTarget,
      pmImplementationSource: selectedChatTarget === 'project-manager' ? 'hal-agents' : 'inline',
      lastAgentError,
      lastError,
      openaiLastStatus,
      openaiLastError,
      kanbanLoaded: true,
      kanbanUrl: 'library',
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
      unitTestsConfigured: true,
      conversationHistoryResetMessage,
    }
  }, [
    params.selectedChatTarget,
    params.lastAgentError,
    params.lastError,
    params.openaiLastStatus,
    params.openaiLastError,
    params.connectedProject,
    params.lastPmOutboundRequest,
    params.lastPmToolCalls,
    params.lastTicketCreationResult,
    params.lastCreateTicketAvailable,
    params.persistenceError,
    params.pmLastResponseId,
    params.previousResponseIdInLastRequest,
    params.agentRunner,
    params.autoMoveDiagnostics,
    params.theme,
    params.themeSource,
    params.lastSendPayloadSummary,
    params.connectedGithubRepo,
    params.conversationHistoryResetMessage,
    params.kanbanBuild,
  ])
}

import { useCallback } from 'react'
import type { Conversation } from '../lib/conversationStorage'

function getEmptyConversations(): Map<string, Conversation> {
  return new Map()
}

interface UseDisconnectParams {
  setKanbanTickets: (tickets: unknown[]) => void
  setKanbanColumns: (columns: unknown[]) => void
  setKanbanAgentRunsByTicketPk: (runs: Record<string, unknown>) => void
  setLastError: (error: string | null) => void
  setConversations: React.Dispatch<React.SetStateAction<Map<string, Conversation>>>
  messageIdRef: React.MutableRefObject<number>
  pmMaxSequenceRef: React.MutableRefObject<number>
  setPersistenceError: (error: string | null) => void
  setConnectedProject: (project: string | null) => void
  setConnectedGithubRepo: (repo: unknown) => void
  setLastTicketCreationResult: (result: unknown) => void
  setLastCreateTicketAvailable: (available: unknown) => void
  setSupabaseUrl: (url: string | null) => void
  setSupabaseAnonKey: (key: string | null) => void
  setUnreadByTarget: (unread: Record<string, number>) => void
  setImplAgentTicketId: (id: string | null) => void
  setQaAgentTicketId: (id: string | null) => void
  setAutoMoveDiagnostics: (diagnostics: Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>) => void
  setCursorRunAgentType: (type: string | null) => void
  setOrphanedCompletionSummary: (summary: string | null) => void
  setPmWorkingMemoryOpen: (open: boolean) => void
}

export function useDisconnect({
  setKanbanTickets,
  setKanbanColumns,
  setKanbanAgentRunsByTicketPk,
  setLastError,
  setConversations,
  messageIdRef,
  pmMaxSequenceRef,
  setPersistenceError,
  setConnectedProject,
  setConnectedGithubRepo,
  setLastTicketCreationResult,
  setLastCreateTicketAvailable,
  setSupabaseUrl,
  setSupabaseAnonKey,
  setUnreadByTarget,
  setImplAgentTicketId,
  setQaAgentTicketId,
  setAutoMoveDiagnostics,
  setCursorRunAgentType,
  setOrphanedCompletionSummary,
  setPmWorkingMemoryOpen,
}: UseDisconnectParams) {
  const handleDisconnect = useCallback(() => {
    setKanbanTickets([])
    setKanbanColumns([])
    setKanbanAgentRunsByTicketPk({})
    setLastError(null)
    // Clear conversations from state (UI will show placeholder), but keep in localStorage for reconnect (0097)
    setConversations(getEmptyConversations())
    messageIdRef.current = 0
    pmMaxSequenceRef.current = 0
    setPersistenceError(null)
    setConnectedProject(null)
    setConnectedGithubRepo(null)
    setLastTicketCreationResult(null)
    setLastCreateTicketAvailable(null)
    setSupabaseUrl(null)
    setSupabaseAnonKey(null)
    setUnreadByTarget({ 'project-manager': 0, 'implementation-agent': 0, 'qa-agent': 0, 'process-review-agent': 0 })
    // Do NOT clear agent status on disconnect (0097: preserve agent status across disconnect/reconnect)
    // Only clear ticket IDs and diagnostics (these are per-session)
    setImplAgentTicketId(null)
    setQaAgentTicketId(null)
    setAutoMoveDiagnostics([])
    setCursorRunAgentType(null)
    setOrphanedCompletionSummary(null)
    setPmWorkingMemoryOpen(false)
    // Do NOT remove localStorage items on disconnect (0097: preserve chats and agent status across disconnect/reconnect)
    // They will be restored when reconnecting to the same repo
  }, [
    setKanbanTickets,
    setKanbanColumns,
    setKanbanAgentRunsByTicketPk,
    setLastError,
    setConversations,
    messageIdRef,
    pmMaxSequenceRef,
    setPersistenceError,
    setConnectedProject,
    setConnectedGithubRepo,
    setLastTicketCreationResult,
    setLastCreateTicketAvailable,
    setSupabaseUrl,
    setSupabaseAnonKey,
    setUnreadByTarget,
    setImplAgentTicketId,
    setQaAgentTicketId,
    setAutoMoveDiagnostics,
    setCursorRunAgentType,
    setOrphanedCompletionSummary,
    setPmWorkingMemoryOpen,
  ])

  return { handleDisconnect }
}

import { useCallback, useRef, useEffect } from 'react'
import { routeKanbanWorkButtonClick, type KanbanWorkButtonPayload } from '../lib/kanbanWorkButtonRouting'
import type { ChatTarget } from '../types/app'
import type { KanbanTicketRow } from 'portfolio-2026-kanban'
import type { Agent } from '../lib/conversationStorage'

interface UseKanbanWorkButtonParams {
  triggerAgentRun: (content: string, target: ChatTarget, imageAttachments?: unknown[], conversationId?: string) => void
  getDefaultConversationId: (agentRole: Agent) => string
  kanbanTickets: KanbanTicketRow[]
  handleKanbanMoveTicket: (ticketPk: string, columnId: string, position?: number) => Promise<void>
  handleKanbanMoveTicketAllowWithoutPr?: (ticketPk: string, columnId: string, position?: number) => Promise<void>
  pmChatWidgetOpen: boolean
  setPmChatWidgetOpen: (open: boolean) => void
  setSelectedChatTarget: (target: ChatTarget) => void
  setSelectedConversationId: (id: string | null) => void
  setLastWorkButtonClick: (click: {
    eventId: string
    timestamp: Date
    chatTarget: ChatTarget
    message: string
  } | null) => void
}

export function useKanbanWorkButton({
  triggerAgentRun,
  getDefaultConversationId,
  kanbanTickets,
  handleKanbanMoveTicket,
  handleKanbanMoveTicketAllowWithoutPr,
  pmChatWidgetOpen,
  setPmChatWidgetOpen,
  setSelectedChatTarget,
  setSelectedConversationId,
  setLastWorkButtonClick,
}: UseKanbanWorkButtonParams) {
  // Use a ref to always access the latest kanbanTickets value, avoiding stale closure issues
  // This fixes the flaky behavior where the first click fails with "assigning to a constant variable" error
  const kanbanTicketsRef = useRef<KanbanTicketRow[]>(kanbanTickets)
  useEffect(() => {
    kanbanTicketsRef.current = kanbanTickets
  }, [kanbanTickets])

  /** Kanban work button: trigger correct Cursor agent run (HAL-0700). */
  const handleKanbanOpenChatAndSend = useCallback(
    async (data: { chatTarget: ChatTarget; message: string; ticketPk?: string }) => {
      if (!data.message) return
      const eventId = `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setLastWorkButtonClick({
        eventId,
        timestamp: new Date(),
        chatTarget: data.chatTarget,
        message: data.message,
      })

      // Route work button action; PM opens PM widget, non-PM never touches PM widget/history (HAL-0700)
      await routeKanbanWorkButtonClick(data as KanbanWorkButtonPayload, {
        pmChatWidgetOpen,
        openPmChatWidget: () => setPmChatWidgetOpen(true),
        setSelectedChatTarget: () => setSelectedChatTarget('project-manager'),
        setSelectedConversationId,
        getDefaultPmConversationId: () => getDefaultConversationId('project-manager'),
        triggerAgentRun: (content, target, conversationId) => triggerAgentRun(content, target, undefined, conversationId),
        moveTicketToDoingIfNeeded: async ({ ticketPk, chatTarget }) => {
          if (chatTarget !== 'implementation-agent' && chatTarget !== 'qa-agent') return
          // Use ref to get latest tickets value, avoiding stale closure that causes flaky behavior
          const currentTickets = kanbanTicketsRef.current
          if (!Array.isArray(currentTickets)) {
            console.warn('[HAL] kanbanTickets is not an array, using empty array as fallback')
            return
          }
          const doingCount = currentTickets.filter((t) => t.kanban_column_id === 'col-doing').length
          // Implement top ticket should not be blocked by "no PR linked" gating;
          // the Implementation Agent run is configured to auto-create the PR.
          if (chatTarget === 'implementation-agent' && handleKanbanMoveTicketAllowWithoutPr) {
            await handleKanbanMoveTicketAllowWithoutPr(ticketPk, 'col-doing', doingCount)
          } else {
            await handleKanbanMoveTicket(ticketPk, 'col-doing', doingCount)
          }
        },
      })
    },
    [
      triggerAgentRun,
      getDefaultConversationId,
      handleKanbanMoveTicket,
      handleKanbanMoveTicketAllowWithoutPr,
      pmChatWidgetOpen,
      setPmChatWidgetOpen,
      setSelectedChatTarget,
      setSelectedConversationId,
      setLastWorkButtonClick,
    ]
  )

  return { handleKanbanOpenChatAndSend }
}

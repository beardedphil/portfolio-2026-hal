import { useCallback } from 'react'
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
        setSelectedChatTarget: (target: 'project-manager') => setSelectedChatTarget(target),
        setSelectedConversationId,
        getDefaultPmConversationId: () => getDefaultConversationId('project-manager'),
        triggerAgentRun: (content, target, conversationId) => triggerAgentRun(content, target, undefined, conversationId),
        moveTicketToDoingIfNeeded: async ({ ticketPk, chatTarget }) => {
          if (chatTarget !== 'implementation-agent' && chatTarget !== 'qa-agent') return
          const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
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
      kanbanTickets,
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

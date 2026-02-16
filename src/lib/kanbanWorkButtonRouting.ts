export type WorkButtonChatTarget =
  | 'project-manager'
  | 'implementation-agent'
  | 'qa-agent'

export type KanbanWorkButtonPayload = {
  chatTarget: WorkButtonChatTarget
  message: string
  ticketPk?: string
}

export type RouteKanbanWorkButtonDeps = {
  /** Whether PM chat widget is currently open (controls whether to open on PM route). */
  pmChatWidgetOpen: boolean
  /** Open the PM chat widget (should only happen for PM route). */
  openPmChatWidget: () => void
  /** Select the PM chat target in UI state. */
  setSelectedChatTarget: (target: 'project-manager') => void
  /** Select conversation in UI state (PM uses null = default). */
  setSelectedConversationId: (conversationId: string | null) => void
  /** Get default conversation ID for PM agent. */
  getDefaultPmConversationId: () => string
  /** Trigger a Cursor agent run (no attachments needed for work buttons). */
  triggerAgentRun: (
    content: string,
    target: WorkButtonChatTarget,
    conversationId?: string
  ) => void
  /** Move ticket to Active Work (col-doing) when needed. */
  moveTicketToDoingIfNeeded: (data: {
    ticketPk: string
    chatTarget: WorkButtonChatTarget
  }) => Promise<void>
}

/**
 * Route Kanban "top ticket" work button behavior.
 *
 * Ticket HAL-0700 requirement: non-PM work buttons must trigger the correct Cursor agent run
 * without opening the PM chat widget or appending to PM conversation history.
 */
export async function routeKanbanWorkButtonClick(
  payload: KanbanWorkButtonPayload,
  deps: RouteKanbanWorkButtonDeps
): Promise<void> {
  if (!payload.message) return

  if (payload.chatTarget === 'project-manager') {
    deps.setSelectedChatTarget('project-manager')
    const conversationId = deps.getDefaultPmConversationId()
    deps.setSelectedConversationId(null)

    if (!deps.pmChatWidgetOpen) deps.openPmChatWidget()

    deps.triggerAgentRun(payload.message, 'project-manager', conversationId)
    return
  }

  if (payload.ticketPk) {
    await deps.moveTicketToDoingIfNeeded({
      ticketPk: payload.ticketPk,
      chatTarget: payload.chatTarget,
    })
  }

  // Non-PM route: trigger the correct agent run. Do NOT touch PM widget state.
  deps.triggerAgentRun(payload.message, payload.chatTarget)
}


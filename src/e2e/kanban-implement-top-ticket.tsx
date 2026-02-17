import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import KanbanBoard, {
  type KanbanTicketRow,
  type KanbanColumnRow,
} from 'portfolio-2026-kanban'
import { useKanbanWorkButton } from '../hooks/useKanbanWorkButton'
import type { ChatTarget } from '../types/app'

function makeIsoNow(): string {
  return new Date('2026-02-17T00:00:00.000Z').toISOString()
}

function makeColumns(now: string): KanbanColumnRow[] {
  return [
    {
      id: 'col-todo',
      title: 'To-do',
      position: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'col-doing',
      title: 'Doing',
      position: 2,
      created_at: now,
      updated_at: now,
    },
  ]
}

function makeTickets(now: string): KanbanTicketRow[] {
  return [
    {
      pk: 'ticket-pk-1',
      id: '1',
      filename: 'HAL-0001.md',
      title: 'Test Ticket A',
      body_md: '',
      kanban_column_id: 'col-todo',
      kanban_position: 0,
      kanban_moved_at: null,
      updated_at: now,
      ticket_number: 1,
      display_id: 'HAL-0001',
    },
  ]
}

function E2EKanbanHarness() {
  const now = useMemo(() => makeIsoNow(), [])
  const [tickets, setTickets] = useState<KanbanTicketRow[]>(() => makeTickets(now))
  const [pmChatWidgetOpen, setPmChatWidgetOpen] = useState(false)
  const [_selectedChatTarget, setSelectedChatTarget] =
    useState<ChatTarget>('project-manager')
  const [_selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [_lastWorkButtonClick, setLastWorkButtonClick] = useState<{
    eventId: string
    timestamp: Date
    chatTarget: ChatTarget
    message: string
  } | null>(null)

  const handleKanbanMoveTicket = async (
    ticketPk: string,
    columnId: string,
    position?: number
  ) => {
    const movedAt = new Date().toISOString()
    setTickets((prev) =>
      prev.map((t) =>
        t.pk === ticketPk
          ? {
              ...t,
              kanban_column_id: columnId,
              kanban_position: typeof position === 'number' ? position : 0,
              kanban_moved_at: movedAt,
              updated_at: movedAt,
            }
          : t
      )
    )
  }

  const { handleKanbanOpenChatAndSend } = useKanbanWorkButton({
    triggerAgentRun: () => {},
    getDefaultConversationId: () => 'project-manager-1',
    kanbanTickets: tickets,
    handleKanbanMoveTicket,
    pmChatWidgetOpen,
    setPmChatWidgetOpen,
    setSelectedChatTarget,
    setSelectedConversationId,
    setLastWorkButtonClick,
  })

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontFamily: 'system-ui, sans-serif', margin: '0 0 12px 0' }}>
        E2E Harness — Kanban Work Button
      </h1>
      <p style={{ fontFamily: 'system-ui, sans-serif', margin: '0 0 18px 0' }}>
        This page is only for Playwright E2E tests. It renders a deterministic Kanban board.
      </p>
      <KanbanBoard
        tickets={tickets}
        columns={makeColumns(now)}
        agentRunsByTicketPk={{}}
        repoFullName="beardedphil/portfolio-2026-hal"
        theme="dark"
        onMoveTicket={handleKanbanMoveTicket}
        onOpenChatAndSend={handleKanbanOpenChatAndSend}
        processReviewRunningForTicketPk={null}
        implementationAgentTicketId={null}
        qaAgentTicketId={null}
        syncStatus="polling"
        lastSync={null}
      />
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <E2EKanbanHarness />
    </React.StrictMode>
  )
}


import { describe, it, expect } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import KanbanBoard, {
  type KanbanTicketRow,
  type KanbanColumnRow,
} from '../projects/kanban/src/entry-lib'
import { useKanbanWorkButton } from './hooks/useKanbanWorkButton'
import type { ChatTarget } from './types/app'

function makeIsoNow() {
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
    },
  ]
}

function Harness() {
  const now = makeIsoNow()
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
    handleKanbanMoveTicketAllowWithoutPr: handleKanbanMoveTicket,
    pmChatWidgetOpen,
    setPmChatWidgetOpen,
    setSelectedChatTarget,
    setSelectedConversationId,
    setLastWorkButtonClick,
  })

  return (
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
  )
}

describe('Kanban UI work button behavior', () => {
  it('moves the top To-do ticket to Active Work when clicking "Implement top ticket"', async () => {
    render(<Harness />)

    const todoColumn = document.querySelector(
      '[data-column-id="col-todo"]'
    ) as HTMLElement | null
    expect(todoColumn).not.toBeNull()

    // Sanity check: ticket starts in To-do.
    expect(within(todoColumn!).getByText('Test Ticket A')).toBeInTheDocument()

    const implementButton = within(todoColumn!).getByRole('button', {
      name: 'Implement top ticket',
    })
    fireEvent.click(implementButton)

    // Ticket should now appear in Active Work row.
    const activeWork = screen.getByLabelText('Active Work')
    await waitFor(() => {
      expect(within(activeWork).getByText('Test Ticket A')).toBeInTheDocument()
    })

    // To-do should now be empty.
    const todoColumnAfter = document.querySelector(
      '[data-column-id="col-todo"]'
    ) as HTMLElement | null
    expect(todoColumnAfter).not.toBeNull()
    expect(
      within(todoColumnAfter!).queryByText('Test Ticket A')
    ).not.toBeInTheDocument()
  })
})


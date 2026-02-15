import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableColumn } from './SortableColumn'
import { HalKanbanContext } from '../HalKanbanContext'
import type { Column, Card } from '../lib/columnTypes'
import type { SupabaseTicketRow } from '../lib/workButtonHandlers'

// Mock SortableCard since it's imported from App.tsx
vi.mock('../App', () => ({
  SortableCard: ({ card }: { card: Card }) => (
    <div data-testid={`card-${card.id}`}>{card.title}</div>
  ),
}))

describe('SortableColumn', () => {
  const mockOnRemove = vi.fn()
  const mockOnOpenDetail = vi.fn()
  const mockHalContext = {
    tickets: [],
    columns: [],
    agentRunsByTicketPk: {},
    repoFullName: null,
    theme: 'light' as const,
    onMoveTicket: vi.fn(),
    processReviewRunningForTicketPk: null,
    implementationAgentTicketId: null,
    qaAgentTicketId: null,
  }

  const defaultColumn: Column = {
    id: 'col-todo',
    title: 'To-do',
    cardIds: [],
  }

  const defaultCards: Record<string, Card> = {}

  const renderColumn = (props: Partial<React.ComponentProps<typeof SortableColumn>> = {}) => {
    return render(
      <HalKanbanContext.Provider value={mockHalContext}>
        <DndContext>
          <SortableColumn
            col={defaultColumn}
            cards={defaultCards}
            onRemove={mockOnRemove}
            {...props}
          />
        </DndContext>
      </HalKanbanContext.Provider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('column header rendering', () => {
    it('renders column title', () => {
      renderColumn({ col: { ...defaultColumn, title: 'Test Column' } })
      expect(screen.getByText('Test Column')).toBeInTheDocument()
    })

    it('renders column title with different text', () => {
      renderColumn({ col: { ...defaultColumn, title: 'In Progress' } })
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })
  })

  describe('remove button presence/absence', () => {
    it('shows remove button when hideRemove is false', () => {
      renderColumn({ hideRemove: false })
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })

    it('hides remove button when hideRemove is true', () => {
      renderColumn({ hideRemove: true })
      expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    })

    it('shows remove button by default when hideRemove is not provided', () => {
      renderColumn()
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })
  })

  describe('ticket cards rendering', () => {
    it('renders ticket cards from cardIds', () => {
      const cards: Record<string, Card> = {
        'card-1': { id: 'card-1', title: 'Ticket 1' },
        'card-2': { id: 'card-2', title: 'Ticket 2' },
      }
      const col: Column = {
        id: 'col-todo',
        title: 'To-do',
        cardIds: ['card-1', 'card-2'],
      }
      renderColumn({ col, cards })
      expect(screen.getByTestId('card-card-1')).toBeInTheDocument()
      expect(screen.getByTestId('card-card-2')).toBeInTheDocument()
    })

    it('renders no cards when cardIds is empty', () => {
      renderColumn({ col: { ...defaultColumn, cardIds: [] } })
      expect(screen.queryByTestId(/^card-/)).not.toBeInTheDocument()
    })

    it('handles missing cards gracefully', () => {
      const col: Column = {
        id: 'col-todo',
        title: 'To-do',
        cardIds: ['card-1', 'missing-card'],
      }
      const cards: Record<string, Card> = {
        'card-1': { id: 'card-1', title: 'Ticket 1' },
      }
      renderColumn({ col, cards })
      expect(screen.getByTestId('card-card-1')).toBeInTheDocument()
      // Missing card should not crash
      expect(screen.queryByTestId('card-missing-card')).not.toBeInTheDocument()
    })
  })

  describe('supabase board mode', () => {
    it('does not crash when supabaseBoardActive is true', () => {
      const cards: Record<string, Card> = {
        'card-1': { id: 'card-1', title: 'Ticket 1' },
      }
      const col: Column = {
        id: 'col-todo',
        title: 'To-do',
        cardIds: ['card-1'],
      }
      const supabaseTickets: SupabaseTicketRow[] = []
      const supabaseColumns: Column[] = []
      renderColumn({
        col,
        cards,
        supabaseBoardActive: true,
        supabaseColumns,
        supabaseTickets,
      })
      expect(screen.getByText('To-do')).toBeInTheDocument()
      expect(screen.getByTestId('card-card-1')).toBeInTheDocument()
    })

    it('does not crash when supabaseBoardActive is false', () => {
      renderColumn({
        supabaseBoardActive: false,
        supabaseColumns: [],
        supabaseTickets: [],
      })
      expect(screen.getByText('To-do')).toBeInTheDocument()
    })

    it('handles supabase columns and tickets without crashing', () => {
      const supabaseColumns: Column[] = [
        { id: 'col-todo', title: 'To-do', cardIds: [] },
        { id: 'col-doing', title: 'Doing', cardIds: [] },
      ]
      const supabaseTickets: SupabaseTicketRow[] = [
        {
          pk: 'ticket-1',
          id: '1',
          filename: 'test.md',
          title: 'Test Ticket',
          body_md: '',
          kanban_column_id: 'col-todo',
          kanban_position: 0,
          kanban_moved_at: null,
          updated_at: new Date().toISOString(),
        },
      ]
      renderColumn({
        supabaseBoardActive: true,
        supabaseColumns,
        supabaseTickets,
      })
      expect(screen.getByText('To-do')).toBeInTheDocument()
    })
  })
})

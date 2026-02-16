import { describe, it, expect } from 'vitest'
import { processTicketsIntoColumns, createCardsFromTickets, sortDoingTickets } from './kanbanDataProcessing'
import type { SupabaseTicketRow } from '../App.types'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'

describe('processTicketsIntoColumns', () => {
  const mockColumns: SupabaseKanbanColumnRow[] = [
    { id: 'col-todo', title: 'To-do', position: 0, created_at: '', updated_at: '' },
    { id: 'col-doing', title: 'Doing', position: 1, created_at: '', updated_at: '' },
    { id: 'col-done', title: 'Done', position: 2, created_at: '', updated_at: '' },
  ]

  it('returns empty columns and unknownIds when sourceColumnsRows is empty', () => {
    const result = processTicketsIntoColumns([], [])
    expect(result.columns).toEqual([])
    expect(result.unknownColumnTicketIds).toEqual([])
  })

  it('assigns tickets to correct columns based on kanban_column_id', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = processTicketsIntoColumns(mockColumns, tickets)
    
    expect(result.columns).toHaveLength(3)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
    expect(result.columns[1].cardIds).toEqual(['ticket-2'])
    expect(result.columns[2].cardIds).toEqual([])
    expect(result.unknownColumnTicketIds).toEqual([])
  })

  it('assigns tickets with null or empty kanban_column_id to first column', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: null,
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: '',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = processTicketsIntoColumns(mockColumns, tickets)
    
    expect(result.columns[0].cardIds).toEqual(['ticket-1', 'ticket-2'])
    expect(result.columns[1].cardIds).toEqual([])
    expect(result.unknownColumnTicketIds).toEqual([])
  })

  it('tracks unknown column IDs and assigns tickets to first column', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-unknown',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = processTicketsIntoColumns(mockColumns, tickets)
    
    expect(result.unknownColumnTicketIds).toEqual(['ticket-1'])
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
  })

  it('sorts tickets within columns by kanban_position', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: 2,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-3',
        id: '3',
        filename: 'ticket-3.md',
        title: 'Test Ticket 3',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: 1,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = processTicketsIntoColumns(mockColumns, tickets)
    
    expect(result.columns[0].cardIds).toEqual(['ticket-2', 'ticket-3', 'ticket-1'])
  })

  it('handles tickets with null kanban_position by treating as 0', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-todo',
        kanban_position: 1,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = processTicketsIntoColumns(mockColumns, tickets)
    
    // ticket-1 with null position should be treated as 0, so it comes before ticket-2 with position 1
    expect(result.columns[0].cardIds).toEqual(['ticket-1', 'ticket-2'])
  })
})

describe('createCardsFromTickets', () => {
  it('creates cards with cleaned titles when display_id is present', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'HAL-0001 — Test Ticket',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
        display_id: 'HAL-0001',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    expect(result['ticket-1']).toEqual({
      id: 'ticket-1',
      title: 'HAL-0001 — Test Ticket',
      displayId: 'HAL-0001',
    })
  })

  it('removes prefix from title when display_id is present', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'HAL-0001 — Test Ticket',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
        display_id: 'HAL-0001',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    // The title should have the prefix removed and display_id prepended
    expect(result['ticket-1'].title).toBe('HAL-0001 — Test Ticket')
  })

  it('uses original title when display_id is not present', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    expect(result['ticket-1']).toEqual({
      id: 'ticket-1',
      title: 'Test Ticket',
      displayId: '0001',
    })
  })

  it('generates displayId from id when display_id is missing', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '42',
        filename: 'ticket-1.md',
        title: 'Test Ticket',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    expect(result['ticket-1'].displayId).toBe('0042')
  })

  it('handles tickets with no id by setting displayId to undefined', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '',
        filename: 'ticket-1.md',
        title: 'Test Ticket',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    expect(result['ticket-1'].displayId).toBeUndefined()
  })

  it('handles multiple tickets correctly', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
        display_id: 'HAL-0001',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: null,
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = createCardsFromTickets(tickets)
    
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['ticket-1'].displayId).toBe('HAL-0001')
    expect(result['ticket-2'].displayId).toBe('0002')
  })
})

describe('sortDoingTickets', () => {
  it('sorts tickets by kanban_position ascending when both have positions', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: 2,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = sortDoingTickets(tickets)
    
    expect(result[0].pk).toBe('ticket-2')
    expect(result[1].pk).toBe('ticket-1')
  })

  it('places tickets with positions before tickets without positions', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: null,
        kanban_moved_at: '2024-01-01T00:00:00Z',
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = sortDoingTickets(tickets)
    
    expect(result[0].pk).toBe('ticket-2')
    expect(result[1].pk).toBe('ticket-1')
  })

  it('sorts tickets without positions by moved_at descending (newer first)', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: null,
        kanban_moved_at: '2024-01-01T00:00:00Z',
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: null,
        kanban_moved_at: '2024-01-02T00:00:00Z',
        updated_at: '',
      },
    ]

    const result = sortDoingTickets(tickets)
    
    expect(result[0].pk).toBe('ticket-2')
    expect(result[1].pk).toBe('ticket-1')
  })

  it('places tickets with moved_at before tickets without moved_at when both have null positions', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket-2.md',
        title: 'Test Ticket 2',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: null,
        kanban_moved_at: '2024-01-01T00:00:00Z',
        updated_at: '',
      },
    ]

    const result = sortDoingTickets(tickets)
    
    expect(result[0].pk).toBe('ticket-2')
    expect(result[1].pk).toBe('ticket-1')
  })

  it('handles empty array', () => {
    const result = sortDoingTickets([])
    expect(result).toEqual([])
  })

  it('handles single ticket', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket-1.md',
        title: 'Test Ticket 1',
        body_md: '',
        kanban_column_id: 'col-doing',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '',
      },
    ]

    const result = sortDoingTickets(tickets)
    
    expect(result).toHaveLength(1)
    expect(result[0].pk).toBe('ticket-1')
  })
})

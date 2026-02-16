import { describe, it, expect } from 'vitest'
import { cleanTicketTitle, transformTicketsToCards, organizeTicketsIntoColumns } from './ticketTransformations'
import type { SupabaseTicketRow } from '../App.types'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'

describe('cleanTicketTitle', () => {
  it('removes HAL- prefix and number from title', () => {
    const result = cleanTicketTitle('HAL-0079 — Implement feature')
    expect(result).toBe('Implement feature')
  })

  it('removes prefix with different format', () => {
    const result = cleanTicketTitle('TICKET-1234 — Fix bug')
    expect(result).toBe('Fix bug')
  })

  it('removes prefix with em dash', () => {
    const result = cleanTicketTitle('HAL-0079 — Test title')
    expect(result).toBe('Test title')
  })

  it('removes prefix with en dash', () => {
    const result = cleanTicketTitle('HAL-0079 – Test title')
    expect(result).toBe('Test title')
  })

  it('removes prefix with hyphen', () => {
    const result = cleanTicketTitle('HAL-0079 - Test title')
    expect(result).toBe('Test title')
  })

  it('returns title unchanged if no prefix pattern matches', () => {
    const result = cleanTicketTitle('Plain title without prefix')
    expect(result).toBe('Plain title without prefix')
  })

  it('handles empty string', () => {
    const result = cleanTicketTitle('')
    expect(result).toBe('')
  })

  it('handles title with only prefix', () => {
    const result = cleanTicketTitle('HAL-0079 —')
    expect(result).toBe('')
  })
})

describe('transformTicketsToCards', () => {
  it('transforms tickets with display_id to cards', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket.md',
        title: 'HAL-0001 — Test Ticket',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
        display_id: 'HAL-0001',
      },
    ]
    const result = transformTicketsToCards(tickets)
    expect(result).toEqual({
      'ticket-1': {
        id: 'ticket-1',
        title: 'HAL-0001 — Test Ticket',
        displayId: 'HAL-0001',
      },
    })
  })

  it('transforms tickets without display_id using id', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-2',
        id: '42',
        filename: 'ticket.md',
        title: 'HAL-0042 — Another Ticket',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = transformTicketsToCards(tickets)
    expect(result).toEqual({
      'ticket-2': {
        id: 'ticket-2',
        title: 'HAL-0042 — Another Ticket',
        displayId: '0042',
      },
    })
  })

  it('transforms tickets without display_id or id', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-3',
        id: '',
        filename: 'ticket.md',
        title: 'Plain Title',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = transformTicketsToCards(tickets)
    expect(result).toEqual({
      'ticket-3': {
        id: 'ticket-3',
        title: 'Plain Title',
        displayId: undefined,
      },
    })
  })

  it('handles multiple tickets', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'HAL-0001 — First',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
        display_id: 'HAL-0001',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket2.md',
        title: 'HAL-0002 — Second',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 1,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
        display_id: 'HAL-0002',
      },
    ]
    const result = transformTicketsToCards(tickets)
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['ticket-1'].title).toBe('HAL-0001 — First')
    expect(result['ticket-2'].title).toBe('HAL-0002 — Second')
  })

  it('handles empty array', () => {
    const result = transformTicketsToCards([])
    expect(result).toEqual({})
  })
})

describe('organizeTicketsIntoColumns', () => {
  const mockColumns: SupabaseKanbanColumnRow[] = [
    { id: 'col-todo', title: 'To-do', position: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'col-doing', title: 'Doing', position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'col-qa', title: 'QA', position: 2, created_at: '2024-01-01', updated_at: '2024-01-01' },
  ]

  it('organizes tickets into correct columns', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket2.md',
        title: 'Ticket 2',
        body_md: 'Body',
        kanban_column_id: 'col-doing',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns).toHaveLength(3)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
    expect(result.columns[1].cardIds).toEqual(['ticket-2'])
    expect(result.columns[2].cardIds).toEqual([])
    expect(result.unknownColumnTicketIds).toEqual([])
  })

  it('sorts tickets by position within each column', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 2,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
      {
        pk: 'ticket-2',
        id: '2',
        filename: 'ticket2.md',
        title: 'Ticket 2',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
      {
        pk: 'ticket-3',
        id: '3',
        filename: 'ticket3.md',
        title: 'Ticket 3',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 1,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns[0].cardIds).toEqual(['ticket-2', 'ticket-3', 'ticket-1'])
  })

  it('assigns tickets with null column_id to first column', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: null,
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
  })

  it('assigns tickets with empty column_id to first column', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: '',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
  })

  it('assigns tickets with unknown column_id to first column and tracks them', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: 'col-unknown',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
    expect(result.unknownColumnTicketIds).toEqual(['ticket-1'])
  })

  it('handles tickets with null position', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: null,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns(mockColumns, tickets)
    expect(result.columns[0].cardIds).toEqual(['ticket-1'])
  })

  it('handles empty columns array', () => {
    const tickets: SupabaseTicketRow[] = [
      {
        pk: 'ticket-1',
        id: '1',
        filename: 'ticket1.md',
        title: 'Ticket 1',
        body_md: 'Body',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01',
      },
    ]
    const result = organizeTicketsIntoColumns([], tickets)
    expect(result.columns).toEqual([])
    expect(result.unknownColumnTicketIds).toEqual([])
  })

  it('handles empty tickets array', () => {
    const result = organizeTicketsIntoColumns(mockColumns, [])
    expect(result.columns).toHaveLength(3)
    expect(result.columns.every((c) => c.cardIds.length === 0)).toBe(true)
    expect(result.unknownColumnTicketIds).toEqual([])
  })
})

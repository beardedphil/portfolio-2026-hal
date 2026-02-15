import { describe, it, expect } from 'vitest'
import { normalizeTicketRow } from './normalizeTicketRow'
import type { SupabaseTicketRow } from './normalizeTicketRow'

describe('normalizeTicketRow', () => {
  describe('display id fallback (LEG-xxxx) logic', () => {
    it('generates LEG-0000 when display_id is missing and id is empty', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0000')
    })

    it('generates LEG-0000 when display_id is missing and id is undefined', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0000')
    })

    it('generates LEG-0123 when display_id is missing and id is "123"', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0123')
    })

    it('generates LEG-9999 when display_id is missing and id is "9999"', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '9999',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-9999')
    })

    it('pads short ids with zeros', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '5',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0005')
    })

    it('uses existing display_id when present and non-empty', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        display_id: 'HAL-0653',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('HAL-0653')
    })

    it('trims whitespace from display_id', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        display_id: '  HAL-0653  ',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('HAL-0653')
    })

    it('generates LEG fallback when display_id is empty string', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        display_id: '',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0123')
    })

    it('generates LEG fallback when display_id is whitespace-only', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        display_id: '   ',
      }
      const result = normalizeTicketRow(row)
      expect(result.display_id).toBe('LEG-0123')
    })
  })

  describe('pk/id fallbacks', () => {
    it('uses pk when provided and non-empty', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: 'legacy-123',
        pk: 'primary-key-456',
      }
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('primary-key-456')
    })

    it('falls back to id when pk is missing', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: 'legacy-123',
      }
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('legacy-123')
    })

    it('falls back to id when pk is empty string', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: 'legacy-123',
        pk: '',
      }
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('legacy-123')
    })

    it('falls back to id when pk is whitespace-only', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: 'legacy-123',
        pk: '   ',
      }
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('legacy-123')
    })

    it('trims whitespace from pk', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: 'legacy-123',
        pk: '  primary-key-456  ',
      }
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('primary-key-456')
    })

    it('falls back to "0000" when both pk and id are missing', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {}
      const result = normalizeTicketRow(row)
      expect(result.pk).toBe('0000')
      expect(result.id).toBe('0000')
    })

    it('trims whitespace from id', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '  legacy-123  ',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.id).toBe('legacy-123')
    })
  })

  describe('other field normalization', () => {
    it('normalizes all string fields to empty string when missing', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.filename).toBe('')
      expect(result.title).toBe('')
      expect(result.body_md).toBe('')
      expect(result.updated_at).toBe('')
    })

    it('preserves string field values when provided', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        filename: 'ticket.md',
        title: 'Test Title',
        body_md: 'Test body',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = normalizeTicketRow(row)
      expect(result.filename).toBe('ticket.md')
      expect(result.title).toBe('Test Title')
      expect(result.body_md).toBe('Test body')
      expect(result.updated_at).toBe('2024-01-01T00:00:00Z')
    })

    it('converts non-string values to strings', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        filename: 123 as any,
        title: null as any,
        body_md: undefined as any,
        updated_at: 0 as any,
      }
      const result = normalizeTicketRow(row)
      expect(result.filename).toBe('123')
      // null ?? '' evaluates to '', so String('') is ''
      expect(result.title).toBe('')
      // undefined ?? '' evaluates to '', so String('') is ''
      expect(result.body_md).toBe('')
      expect(result.updated_at).toBe('0')
    })

    it('preserves kanban fields when provided', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        kanban_column_id: 'col-doing',
        kanban_position: 5,
        kanban_moved_at: '2024-01-01T00:00:00Z',
      }
      const result = normalizeTicketRow(row)
      expect(result.kanban_column_id).toBe('col-doing')
      expect(result.kanban_position).toBe(5)
      expect(result.kanban_moved_at).toBe('2024-01-01T00:00:00Z')
    })

    it('sets kanban fields to null when missing', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.kanban_column_id).toBeNull()
      expect(result.kanban_position).toBeNull()
      expect(result.kanban_moved_at).toBeNull()
    })

    it('preserves repo_full_name and ticket_number when provided', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
        repo_full_name: 'owner/repo',
        ticket_number: 42,
      }
      const result = normalizeTicketRow(row)
      expect(result.repo_full_name).toBe('owner/repo')
      expect(result.ticket_number).toBe(42)
    })

    it('preserves undefined repo_full_name and ticket_number', () => {
      const row: Partial<SupabaseTicketRow> & { id?: string } = {
        id: '123',
        pk: 'test-pk',
      }
      const result = normalizeTicketRow(row)
      expect(result.repo_full_name).toBeUndefined()
      expect(result.ticket_number).toBeUndefined()
    })
  })
})

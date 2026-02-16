/**
 * Unit tests for ticket ID resolution helper.
 * Tests the multi-strategy resolution logic used by /api/tickets/move.
 */

import { describe, it, expect } from 'vitest'
import { resolveTicketRef } from './_resolveTicketRef.js'

describe('resolveTicketRef', () => {
  it('returns empty array for undefined ticketId', () => {
    expect(resolveTicketRef(undefined)).toEqual([])
  })

  it('returns empty array for empty string ticketId', () => {
    expect(resolveTicketRef('')).toEqual([])
  })

  it('returns empty array for whitespace-only ticketId', () => {
    expect(resolveTicketRef('   ')).toEqual([])
  })

  describe('Strategy 1: Try by id field as-is', () => {
    it('includes id lookup for numeric ticketId', () => {
      const result = resolveTicketRef('172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('includes id lookup for numeric ticketId without leading zeros', () => {
      const result = resolveTicketRef('1')
      expect(result).toContainEqual({ type: 'id', value: '1' })
    })
  })

  describe('Strategy 2: Try by display_id', () => {
    it('includes display_id lookup for any ticketId', () => {
      const result = resolveTicketRef('172')
      expect(result).toContainEqual({ type: 'display_id', value: '172' })
    })

    it('includes display_id lookup for display ID format', () => {
      const result = resolveTicketRef('HAL-0172')
      expect(result).toContainEqual({ type: 'display_id', value: 'HAL-0172' })
    })
  })

  describe('Strategy 3: Extract numeric part from display_id format and try by id', () => {
    it('extracts numeric part from display_id format (e.g., HAL-0172)', () => {
      const result = resolveTicketRef('HAL-0172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('strips leading zeros from extracted numeric part', () => {
      const result = resolveTicketRef('HAL-000172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('handles single digit after prefix', () => {
      const result = resolveTicketRef('HAL-0001')
      expect(result).toContainEqual({ type: 'id', value: '1' })
    })

    it('handles display_id without leading zeros', () => {
      const result = resolveTicketRef('HAL-172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('does not add duplicate id lookup if numeric part equals original', () => {
      const result = resolveTicketRef('HAL-172')
      const idLookups = result.filter((r) => r.type === 'id' && r.value === '172')
      // Should have exactly one: the one from Strategy 1 (as-is)
      expect(idLookups.length).toBe(1)
    })

    it('handles different prefix formats', () => {
      const result = resolveTicketRef('PROJ-0172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('only applies to ticketIds that match display_id pattern', () => {
      const result = resolveTicketRef('172')
      // Should not have Strategy 3 lookup (no prefix)
      const hasStrategy3 = result.some((r) => r.type === 'id' && r.value === '172' && r.value !== '172')
      expect(hasStrategy3).toBe(false)
    })
  })

  describe('Strategy 4: Strip leading zeros from numeric ticketId', () => {
    it('strips leading zeros from numeric ticketId with leading zeros', () => {
      const result = resolveTicketRef('0172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('handles multiple leading zeros', () => {
      const result = resolveTicketRef('000172')
      expect(result).toContainEqual({ type: 'id', value: '172' })
    })

    it('handles all zeros (keeps at least one)', () => {
      const result = resolveTicketRef('0000')
      expect(result).toContainEqual({ type: 'id', value: '0' })
      // Should have: id: '0000' (Strategy 1), display_id: '0000' (Strategy 2), id: '0' (Strategy 4)
      expect(result).toContainEqual({ type: 'id', value: '0000' })
      expect(result).toContainEqual({ type: 'display_id', value: '0000' })
    })

    it('does not add duplicate id lookup if no leading zeros', () => {
      const result = resolveTicketRef('172')
      const idLookups = result.filter((r) => r.type === 'id' && r.value === '172')
      // Should have exactly one: the one from Strategy 1 (as-is)
      expect(idLookups.length).toBe(1)
    })

    it('only applies to numeric ticketIds', () => {
      const result = resolveTicketRef('HAL-0172')
      // Strategy 4 should not apply (not purely numeric)
      const hasStrategy4 = result.some((r) => r.type === 'id' && r.value === '172' && r.value.startsWith('0'))
      expect(hasStrategy4).toBe(false)
    })
  })

  describe('Complete resolution order', () => {
    it('returns all strategies in correct order for numeric ticketId', () => {
      const result = resolveTicketRef('172')
      expect(result).toEqual([
        { type: 'id', value: '172' }, // Strategy 1
        { type: 'display_id', value: '172' }, // Strategy 2
      ])
    })

    it('returns all strategies in correct order for numeric ticketId with leading zeros', () => {
      const result = resolveTicketRef('0172')
      expect(result).toEqual([
        { type: 'id', value: '0172' }, // Strategy 1 (as-is)
        { type: 'display_id', value: '0172' }, // Strategy 2
        { type: 'id', value: '172' }, // Strategy 4 (strip leading zeros)
      ])
    })

    it('returns all strategies in correct order for display_id format', () => {
      const result = resolveTicketRef('HAL-0172')
      // Strategy 1 doesn't apply (not numeric)
      // Strategy 2: display_id
      // Strategy 3: extract numeric part and try by id
      expect(result).toEqual([
        { type: 'display_id', value: 'HAL-0172' }, // Strategy 2
        { type: 'id', value: '172' }, // Strategy 3 (extract and strip leading zeros)
      ])
    })

    it('handles display_id without leading zeros', () => {
      const result = resolveTicketRef('HAL-172')
      // Strategy 1 doesn't apply (not numeric)
      // Strategy 2: display_id
      // Strategy 3: extract numeric part and try by id (even without leading zeros)
      expect(result).toEqual([
        { type: 'display_id', value: 'HAL-172' }, // Strategy 2
        { type: 'id', value: '172' }, // Strategy 3 (extract numeric part)
      ])
    })
  })

  describe('Edge cases', () => {
    it('handles single digit', () => {
      const result = resolveTicketRef('1')
      expect(result).toEqual([
        { type: 'id', value: '1' },
        { type: 'display_id', value: '1' },
      ])
    })

    it('handles zero', () => {
      const result = resolveTicketRef('0')
      expect(result).toEqual([
        { type: 'id', value: '0' },
        { type: 'display_id', value: '0' },
      ])
    })

    it('handles very long numeric id', () => {
      const result = resolveTicketRef('1234567890')
      expect(result).toEqual([
        { type: 'id', value: '1234567890' },
        { type: 'display_id', value: '1234567890' },
      ])
    })

    it('handles display_id with very long numeric part', () => {
      const result = resolveTicketRef('HAL-0001234567890')
      expect(result).toContainEqual({ type: 'id', value: '1234567890' })
    })

    it('trims whitespace from ticketId', () => {
      const result = resolveTicketRef('  172  ')
      expect(result).toEqual([
        { type: 'id', value: '172' },
        { type: 'display_id', value: '172' },
      ])
    })
  })
})

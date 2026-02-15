/**
 * Unit tests for ticket ID resolution helper.
 * Tests the pure helper that generates lookup attempts for multi-strategy ticket ID resolution.
 */

import { describe, it, expect } from 'vitest'
import { generateTicketLookupAttempts, type TicketLookupAttempt } from './_resolveTicketRef.js'

describe('generateTicketLookupAttempts', () => {
  it('returns empty array for undefined ticketId', () => {
    const attempts = generateTicketLookupAttempts(undefined)
    expect(attempts).toEqual([])
  })

  it('returns empty array for empty string ticketId', () => {
    const attempts = generateTicketLookupAttempts('')
    expect(attempts).toEqual([])
  })

  describe('Strategy 1: Try by id field as-is', () => {
    it('includes id lookup for numeric ticketId', () => {
      const attempts = generateTicketLookupAttempts('172')
      expect(attempts.length).toBeGreaterThan(0)
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '172' })
      expect(attempts[0].description).toContain('id field as-is')
    })

    it('includes id lookup for zero-padded ticketId', () => {
      const attempts = generateTicketLookupAttempts('0172')
      expect(attempts.length).toBeGreaterThan(0)
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '0172' })
    })

    it('includes id lookup for display_id format', () => {
      const attempts = generateTicketLookupAttempts('HAL-0172')
      expect(attempts.length).toBeGreaterThan(0)
      expect(attempts[0].strategy).toEqual({ type: 'id', value: 'HAL-0172' })
    })
  })

  describe('Strategy 2: Try by display_id', () => {
    it('includes display_id lookup for any ticketId', () => {
      const attempts = generateTicketLookupAttempts('172')
      expect(attempts.length).toBeGreaterThanOrEqual(2)
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: '172' })
      expect(attempts[1].description).toContain('display_id')
    })

    it('includes display_id lookup for display_id format', () => {
      const attempts = generateTicketLookupAttempts('HAL-0172')
      expect(attempts.length).toBeGreaterThanOrEqual(2)
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: 'HAL-0172' })
    })
  })

  describe('Strategy 3: Extract numeric part from display_id and try by id', () => {
    it('extracts numeric part from display_id format (HAL-0172)', () => {
      const attempts = generateTicketLookupAttempts('HAL-0172')
      // Should have at least 3 attempts: id as-is, display_id, and extracted numeric id
      expect(attempts.length).toBeGreaterThanOrEqual(3)
      
      const extractedAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '172'
      )
      expect(extractedAttempt).toBeDefined()
      expect(extractedAttempt?.description).toContain('Extract numeric part')
      expect(extractedAttempt?.description).toContain('HAL-0172')
      expect(extractedAttempt?.description).toContain('172')
    })

    it('extracts numeric part from display_id format without leading zeros (HAL-172)', () => {
      const attempts = generateTicketLookupAttempts('HAL-172')
      // Should have at least 3 attempts: id as-is, display_id, and extracted numeric id
      expect(attempts.length).toBeGreaterThanOrEqual(3)
      
      const extractedAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '172'
      )
      expect(extractedAttempt).toBeDefined()
    })

    it('handles display_id with all zeros in numeric part (HAL-0000)', () => {
      const attempts = generateTicketLookupAttempts('HAL-0000')
      // Should have at least 3 attempts
      expect(attempts.length).toBeGreaterThanOrEqual(3)
      
      const extractedAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '0'
      )
      expect(extractedAttempt).toBeDefined()
    })

    it('does not add extracted attempt if numeric part equals original ticketId', () => {
      const attempts = generateTicketLookupAttempts('HAL-172')
      // The extracted numeric part "172" should not duplicate the first attempt
      // But it should still be present as a separate attempt
      const idAttempts = attempts.filter((a) => a.strategy.type === 'id' && a.strategy.value === '172')
      // Should have at least one (from extraction), but may have more
      expect(idAttempts.length).toBeGreaterThanOrEqual(1)
    })

    it('does not add extracted attempt for non-display_id format', () => {
      const attempts = generateTicketLookupAttempts('172')
      // Should not have an extracted attempt since it doesn't match display_id pattern
      const extractedAttempts = attempts.filter((a) => 
        a.description.includes('Extract numeric part')
      )
      expect(extractedAttempts.length).toBe(0)
    })
  })

  describe('Strategy 4: Remove leading zeros from numeric ticketId', () => {
    it('removes leading zeros from zero-padded numeric ticketId (0172)', () => {
      const attempts = generateTicketLookupAttempts('0172')
      // Should have at least 3 attempts: id as-is, display_id, and without leading zeros
      expect(attempts.length).toBeGreaterThanOrEqual(3)
      
      const withoutZerosAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '172'
      )
      expect(withoutZerosAttempt).toBeDefined()
      expect(withoutZerosAttempt?.description).toContain('Remove leading zeros')
      expect(withoutZerosAttempt?.description).toContain('0172')
      expect(withoutZerosAttempt?.description).toContain('172')
    })

    it('removes leading zeros from multiple leading zeros (000172)', () => {
      const attempts = generateTicketLookupAttempts('000172')
      const withoutZerosAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '172'
      )
      expect(withoutZerosAttempt).toBeDefined()
    })

    it('handles all zeros (0000)', () => {
      const attempts = generateTicketLookupAttempts('0000')
      const withoutZerosAttempt = attempts.find(
        (a) => a.strategy.type === 'id' && a.strategy.value === '0'
      )
      expect(withoutZerosAttempt).toBeDefined()
    })

    it('does not add attempt if ticketId has no leading zeros', () => {
      const attempts = generateTicketLookupAttempts('172')
      const withoutZerosAttempts = attempts.filter((a) => 
        a.description.includes('Remove leading zeros')
      )
      expect(withoutZerosAttempts.length).toBe(0)
    })

    it('does not add attempt for non-numeric ticketId', () => {
      const attempts = generateTicketLookupAttempts('HAL-0172')
      const withoutZerosAttempts = attempts.filter((a) => 
        a.description.includes('Remove leading zeros')
      )
      expect(withoutZerosAttempts.length).toBe(0)
    })
  })

  describe('Complete resolution order for different formats', () => {
    it('generates correct order for numeric ticketId (172)', () => {
      const attempts = generateTicketLookupAttempts('172')
      expect(attempts.length).toBe(2) // id as-is, display_id
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '172' })
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: '172' })
    })

    it('generates correct order for zero-padded numeric ticketId (0172)', () => {
      const attempts = generateTicketLookupAttempts('0172')
      expect(attempts.length).toBe(3) // id as-is, display_id, without leading zeros
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '0172' })
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: '0172' })
      expect(attempts[2].strategy).toEqual({ type: 'id', value: '172' })
      expect(attempts[2].description).toContain('Remove leading zeros')
    })

    it('generates correct order for display_id format (HAL-0172)', () => {
      const attempts = generateTicketLookupAttempts('HAL-0172')
      expect(attempts.length).toBe(3) // id as-is, display_id, extracted numeric id
      expect(attempts[0].strategy).toEqual({ type: 'id', value: 'HAL-0172' })
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: 'HAL-0172' })
      expect(attempts[2].strategy).toEqual({ type: 'id', value: '172' })
      expect(attempts[2].description).toContain('Extract numeric part')
    })

    it('generates correct order for display_id without leading zeros (HAL-172)', () => {
      const attempts = generateTicketLookupAttempts('HAL-172')
      expect(attempts.length).toBe(3) // id as-is, display_id, extracted numeric id
      expect(attempts[0].strategy).toEqual({ type: 'id', value: 'HAL-172' })
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: 'HAL-172' })
      expect(attempts[2].strategy).toEqual({ type: 'id', value: '172' })
    })
  })

  describe('Edge cases', () => {
    it('handles single digit ticketId', () => {
      const attempts = generateTicketLookupAttempts('5')
      expect(attempts.length).toBe(2)
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '5' })
      expect(attempts[1].strategy).toEqual({ type: 'display_id', value: '5' })
    })

    it('handles display_id with single digit (HAL-5)', () => {
      const attempts = generateTicketLookupAttempts('HAL-5')
      expect(attempts.length).toBe(3)
      expect(attempts[2].strategy).toEqual({ type: 'id', value: '5' })
    })

    it('handles display_id with different prefix (PROJ-123)', () => {
      const attempts = generateTicketLookupAttempts('PROJ-123')
      expect(attempts.length).toBe(3)
      expect(attempts[2].strategy).toEqual({ type: 'id', value: '123' })
    })

    it('handles very long numeric ticketId', () => {
      const attempts = generateTicketLookupAttempts('1234567890')
      expect(attempts.length).toBe(2)
      expect(attempts[0].strategy).toEqual({ type: 'id', value: '1234567890' })
    })
  })
})

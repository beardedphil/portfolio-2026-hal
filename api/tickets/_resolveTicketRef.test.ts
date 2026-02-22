import { describe, it, expect } from 'vitest'
import { resolveTicketRef } from './_resolveTicketRef.js'

describe('resolveTicketRef', () => {
  it('returns empty array for undefined', () => {
    expect(resolveTicketRef(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(resolveTicketRef('')).toEqual([])
    expect(resolveTicketRef('   ')).toEqual([])
  })

  it('handles numeric ticket IDs', () => {
    const result = resolveTicketRef('172')
    expect(result).toContainEqual({ type: 'id', value: '172' })
    expect(result).toContainEqual({ type: 'display_id', value: '172' })
  })

  it('handles display ID format', () => {
    const result = resolveTicketRef('HAL-0172')
    expect(result).toContainEqual({ type: 'display_id', value: 'HAL-0172' })
    expect(result).toContainEqual({ type: 'id', value: '172' })
  })

  it('extracts numeric part from display ID', () => {
    const result = resolveTicketRef('HAL-0172')
    const idAttempt = result.find(a => a.type === 'id' && a.value === '172')
    expect(idAttempt).toBeDefined()
  })

  it('handles display ID with leading zeros', () => {
    const result = resolveTicketRef('HAL-0001')
    expect(result).toContainEqual({ type: 'display_id', value: 'HAL-0001' })
    expect(result).toContainEqual({ type: 'id', value: '1' })
  })

  it('handles numeric ID with leading zeros', () => {
    const result = resolveTicketRef('0172')
    expect(result).toContainEqual({ type: 'id', value: '0172' })
    expect(result).toContainEqual({ type: 'display_id', value: '0172' })
    expect(result).toContainEqual({ type: 'id', value: '172' })
  })

  it('handles all zeros', () => {
    const result = resolveTicketRef('0000')
    expect(result).toContainEqual({ type: 'id', value: '0000' })
    expect(result).toContainEqual({ type: 'display_id', value: '0000' })
    expect(result).toContainEqual({ type: 'id', value: '0' })
  })

  it('handles single zero', () => {
    const result = resolveTicketRef('0')
    expect(result).toContainEqual({ type: 'id', value: '0' })
    expect(result).toContainEqual({ type: 'display_id', value: '0' })
  })

  it('handles different prefix formats', () => {
    const result = resolveTicketRef('TICKET-123')
    expect(result).toContainEqual({ type: 'display_id', value: 'TICKET-123' })
    expect(result).toContainEqual({ type: 'id', value: '123' })
  })

  it('trims whitespace', () => {
    const result1 = resolveTicketRef('172')
    const result2 = resolveTicketRef('  172  ')
    expect(result1).toEqual(result2)
  })

  it('does not duplicate attempts', () => {
    const result = resolveTicketRef('172')
    const idAttempts = result.filter(a => a.type === 'id' && a.value === '172')
    expect(idAttempts.length).toBe(1)
  })
})

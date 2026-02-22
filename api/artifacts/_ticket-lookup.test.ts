import { describe, it, expect } from 'vitest'
import { validateTicketId } from './_ticket-lookup.js'

describe('validateTicketId', () => {
  it('rejects undefined', () => {
    const result = validateTicketId(undefined)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('required')
  })

  it('rejects empty string', () => {
    const result = validateTicketId('')
    expect(result.valid).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    const result = validateTicketId('   ')
    expect(result.valid).toBe(false)
  })

  it('accepts numeric IDs', () => {
    expect(validateTicketId('123').valid).toBe(true)
    expect(validateTicketId('0713').valid).toBe(true)
    expect(validateTicketId('0').valid).toBe(true)
  })

  it('accepts display IDs', () => {
    expect(validateTicketId('HAL-0713').valid).toBe(true)
    expect(validateTicketId('TICKET-123').valid).toBe(true)
  })

  it('accepts UUID format', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    expect(validateTicketId(uuid).valid).toBe(true)
  })

  it('rejects IDs longer than 128 characters', () => {
    const longId = 'x'.repeat(129)
    const result = validateTicketId(longId)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('too long')
  })

  it('accepts IDs with numbers embedded', () => {
    expect(validateTicketId('ticket-123').valid).toBe(true)
    expect(validateTicketId('123abc').valid).toBe(true)
  })

  it('rejects invalid formats', () => {
    expect(validateTicketId('invalid-format').valid).toBe(false)
    expect(validateTicketId('no-numbers').valid).toBe(false)
  })

  it('trims whitespace', () => {
    expect(validateTicketId('  123  ').valid).toBe(true)
    expect(validateTicketId('  HAL-0713  ').valid).toBe(true)
  })
})

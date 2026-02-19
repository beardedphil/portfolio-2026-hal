import { describe, it, expect } from 'vitest'
import { isUnknownColumnError, isUniqueViolation } from './runPmAgent'
import { parseTicketNumber } from '../../lib/projectManagerHelpers'

describe('isUnknownColumnError', () => {
  it('returns true for Postgres error code 42703', () => {
    const err = { code: '42703', message: 'column "xyz" does not exist' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns true for error message containing "column" and "does not exist"', () => {
    const err = { message: 'column "xyz" does not exist' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns true for case-insensitive column error message', () => {
    const err = { message: 'COLUMN "xyz" DOES NOT EXIST' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns false for other Postgres error codes', () => {
    const err = { code: '23505', message: 'duplicate key value' }
    expect(isUnknownColumnError(err)).toBe(false)
  })

  it('returns false for errors without column-related message', () => {
    const err = { message: 'connection timeout' }
    expect(isUnknownColumnError(err)).toBe(false)
  })

  it('returns false for null or undefined error', () => {
    expect(isUnknownColumnError(null as any)).toBe(false)
    expect(isUnknownColumnError(undefined as any)).toBe(false)
  })

  it('returns false for error with empty message', () => {
    const err = { message: '' }
    expect(isUnknownColumnError(err)).toBe(false)
  })
})

describe('isUniqueViolation', () => {
  it('returns true for Postgres unique constraint error code 23505', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true for error message containing "duplicate key"', () => {
    const err = { message: 'duplicate key value violates unique constraint' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true for error message containing "unique constraint"', () => {
    const err = { message: 'violates unique constraint "tickets_id_key"' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true for case-insensitive unique violation message', () => {
    const err = { message: 'DUPLICATE KEY VALUE' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns false for other Postgres error codes', () => {
    const err = { code: '42703', message: 'column does not exist' }
    expect(isUniqueViolation(err)).toBe(false)
  })

  it('returns false for errors without unique-related message', () => {
    const err = { message: 'connection timeout' }
    expect(isUniqueViolation(err)).toBe(false)
  })

  it('returns false for null error', () => {
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('returns false for error with empty message', () => {
    const err = { message: '' }
    expect(isUniqueViolation(err)).toBe(false)
  })
})

describe('parseTicketNumber integration', () => {
  it('parses ticket ID with prefix (e.g. HAL-0012)', () => {
    expect(parseTicketNumber('HAL-0012')).toBe(12)
  })

  it('parses ticket ID without prefix (e.g. 0012)', () => {
    expect(parseTicketNumber('0012')).toBe(12)
  })

  it('parses ticket ID as number (e.g. 12)', () => {
    expect(parseTicketNumber('12')).toBe(12)
  })

  it('returns null for invalid ticket ID', () => {
    expect(parseTicketNumber('invalid')).toBeNull()
  })

  it('handles ticket ID with leading zeros', () => {
    expect(parseTicketNumber('0001')).toBe(1)
  })
})

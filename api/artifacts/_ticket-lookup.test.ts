import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateTicketId, lookupTicket } from './_ticket-lookup.js'
import type { SupabaseClient } from '@supabase/supabase-js'

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

describe('lookupTicket', () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    maybeSingle: vi.fn(),
  } as unknown as SupabaseClient

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('looks up ticket by pk UUID', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    ;(mockSupabase as any).maybeSingle.mockResolvedValue({
      data: { pk: uuid, repo_full_name: 'test/repo', display_id: 'HAL-0123' },
      error: null,
    })

    const result = await lookupTicket(mockSupabase, uuid)

    expect(result.ticket).not.toBeNull()
    expect(result.ticket?.pk).toBe(uuid)
    expect((mockSupabase as any).eq).toHaveBeenCalledWith('pk', uuid)
  })

  it('looks up ticket by display_id', async () => {
    ;(mockSupabase as any).maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // UUID lookup fails
      .mockResolvedValueOnce({
        data: { pk: 'pk-123', repo_full_name: 'test/repo', display_id: 'HAL-0123' },
        error: null,
      })

    const result = await lookupTicket(mockSupabase, 'HAL-0123')

    expect(result.ticket).not.toBeNull()
    expect(result.ticket?.display_id).toBe('HAL-0123')
  })

  it('looks up ticket by ticket_number', async () => {
    ;(mockSupabase as any).maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // UUID lookup fails
      .mockResolvedValueOnce({ data: null, error: null }) // display_id lookup fails
      .mockResolvedValueOnce({
        data: { pk: 'pk-123', repo_full_name: 'test/repo', display_id: 'HAL-0123' },
        error: null,
      })

    const result = await lookupTicket(mockSupabase, '123')

    expect(result.ticket).not.toBeNull()
    expect((mockSupabase as any).eq).toHaveBeenCalledWith('ticket_number', 123)
  })

  it('returns error when ticket not found', async () => {
    ;(mockSupabase as any).maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await lookupTicket(mockSupabase, 'INVALID-999')

    expect(result.ticket).toBeNull()
    expect(result.error).toContain('not found')
  })

  it('handles database errors', async () => {
    ;(mockSupabase as any).maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    })

    const result = await lookupTicket(mockSupabase, '123')

    expect(result.ticket).toBeNull()
    expect(result.error).toBe('Database error')
  })
})

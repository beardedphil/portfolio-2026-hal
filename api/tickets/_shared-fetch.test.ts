import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTicketByPkOrId } from './_shared.js'
import * as resolveTicketRef from './_resolveTicketRef.js'

vi.mock('./_resolveTicketRef.js', () => ({
  resolveTicketRef: vi.fn(),
}))

describe('fetchTicketByPkOrId', () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    maybeSingle: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses ticketPk directly when provided', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: { pk: 'pk-123', repo_full_name: 'test/repo' },
      error: null,
    })

    const result = await fetchTicketByPkOrId(mockSupabase, 'pk-123')

    expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
    expect(mockSupabase.select).toHaveBeenCalledWith('pk, repo_full_name, kanban_column_id, kanban_position')
    expect(mockSupabase.eq).toHaveBeenCalledWith('pk', 'pk-123')
    expect(result).not.toBeNull()
    expect(result?.data?.pk).toBe('pk-123')
  })

  it('returns null when no ticketPk or ticketId provided', async () => {
    const result = await fetchTicketByPkOrId(mockSupabase)
    expect(result).toBeNull()
  })

  it('uses resolveTicketRef when ticketId provided', async () => {
    vi.mocked(resolveTicketRef.resolveTicketRef).mockReturnValue([
      { type: 'display_id', value: 'HAL-0123' },
    ])
    mockSupabase.maybeSingle.mockResolvedValue({
      data: { pk: 'pk-123', repo_full_name: 'test/repo' },
      error: null,
    })

    const result = await fetchTicketByPkOrId(mockSupabase, undefined, 'HAL-0123')

    expect(resolveTicketRef.resolveTicketRef).toHaveBeenCalledWith('HAL-0123')
    expect(mockSupabase.eq).toHaveBeenCalledWith('display_id', 'HAL-0123')
    expect(result).not.toBeNull()
  })

  it('returns null when resolveTicketRef returns empty array', async () => {
    vi.mocked(resolveTicketRef.resolveTicketRef).mockReturnValue([])

    const result = await fetchTicketByPkOrId(mockSupabase, undefined, 'invalid')

    expect(result).toBeNull()
  })

  it('tries multiple lookup attempts until one succeeds', async () => {
    vi.mocked(resolveTicketRef.resolveTicketRef).mockReturnValue([
      { type: 'display_id', value: 'HAL-0123' },
      { type: 'id', value: '123' },
    ])
    // First attempt fails, second succeeds
    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { pk: 'pk-123' }, error: null })

    const result = await fetchTicketByPkOrId(mockSupabase, undefined, 'HAL-0123')

    expect(mockSupabase.eq).toHaveBeenCalledWith('display_id', 'HAL-0123')
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', '123')
    expect(result?.data?.pk).toBe('pk-123')
  })

  it('returns last attempt result when all fail', async () => {
    vi.mocked(resolveTicketRef.resolveTicketRef).mockReturnValue([
      { type: 'display_id', value: 'HAL-0123' },
    ])
    mockSupabase.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    })

    const result = await fetchTicketByPkOrId(mockSupabase, undefined, 'HAL-0123')

    expect(result).not.toBeNull()
    expect(result?.error).toBeDefined()
  })
})

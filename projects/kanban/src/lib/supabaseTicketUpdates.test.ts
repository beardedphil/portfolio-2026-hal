/**
 * Unit tests for Supabase ticket update functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { updateTicketKanban } from './supabaseTicketUpdates'
import * as supabaseJs from '@supabase/supabase-js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

describe('updateTicketKanban', () => {
  let mockClient: Partial<SupabaseClient>

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
    }
    vi.mocked(supabaseJs.createClient).mockReturnValue(mockClient as SupabaseClient)
  })

  it('returns error when URL is empty', async () => {
    const result = await updateTicketKanban('', 'key', 'pk1', { kanban_column_id: 'col-todo' })
    expect(result).toEqual({ ok: false, error: 'Supabase not configured (URL/key missing). Connect first.' })
  })

  it('returns error when key is empty', async () => {
    const result = await updateTicketKanban('https://example.supabase.co', '', 'pk1', { kanban_column_id: 'col-todo' })
    expect(result).toEqual({ ok: false, error: 'Supabase not configured (URL/key missing). Connect first.' })
  })

  it('trims whitespace from URL and key', async () => {
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await updateTicketKanban('  https://example.supabase.co  ', '  key  ', 'pk1', { kanban_column_id: 'col-todo' })

    expect(result).toEqual({ ok: true })
    expect(mockClient.from).toHaveBeenCalledWith('tickets')
    expect(mockQuery.update).toHaveBeenCalledWith({ kanban_column_id: 'col-todo' })
    expect(mockQuery.eq).toHaveBeenCalledWith('pk', 'pk1')
  })

  it('updates ticket successfully', async () => {
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await updateTicketKanban(
      'https://example.supabase.co',
      'key',
      'pk1',
      { kanban_column_id: 'col-qa', kanban_position: 0, kanban_moved_at: '2024-01-01T00:00:00Z' }
    )

    expect(result).toEqual({ ok: true })
    expect(mockQuery.update).toHaveBeenCalledWith({
      kanban_column_id: 'col-qa',
      kanban_position: 0,
      kanban_moved_at: '2024-01-01T00:00:00Z',
    })
  })

  it('returns error on database error', async () => {
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'Database error' } }),
    }
    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await updateTicketKanban('https://example.supabase.co', 'key', 'pk1', { kanban_column_id: 'col-todo' })

    expect(result).toEqual({ ok: false, error: 'Database error' })
  })

  it('handles exceptions gracefully', async () => {
    mockClient.from = vi.fn().mockImplementation(() => {
      throw new Error('Network error')
    })

    const result = await updateTicketKanban('https://example.supabase.co', 'key', 'pk1', { kanban_column_id: 'col-todo' })

    expect(result).toEqual({ ok: false, error: 'Network error' })
  })
})

/**
 * Unit tests for Supabase data fetching functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseClient,
  fetchTickets,
  fetchTicketArtifacts,
  fetchTicketAttachments,
  fetchActiveAgentRuns,
} from './supabaseDataFetchers'
import type { SupabaseTicketRow, SupabaseAgentArtifactRow, SupabaseAgentRunRow, TicketAttachment } from '../App.types'

describe('createSupabaseClient', () => {
  it('returns null when URL is empty', () => {
    const result = createSupabaseClient('', 'key')
    expect(result).toBeNull()
  })

  it('returns null when key is empty', () => {
    const result = createSupabaseClient('https://example.supabase.co', '')
    expect(result).toBeNull()
  })

  it('returns null when both URL and key are empty', () => {
    const result = createSupabaseClient('', '')
    expect(result).toBeNull()
  })

  it('trims whitespace from URL and key', () => {
    const result = createSupabaseClient('  https://example.supabase.co  ', '  key  ')
    expect(result).not.toBeNull()
  })
})

describe('fetchTickets', () => {
  let mockClient: Partial<SupabaseClient>

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
    }
  })

  it('returns empty array when repoFullName is null', async () => {
    const result = await fetchTickets(mockClient as SupabaseClient, null)
    expect(result).toEqual([])
    expect(mockClient.from).not.toHaveBeenCalled()
  })

  it('returns empty array when repoFullName is empty string', async () => {
    const result = await fetchTickets(mockClient as SupabaseClient, '')
    expect(result).toEqual([])
  })

  it('fetches and normalizes tickets successfully', async () => {
    const mockTickets = [
      {
        pk: 'pk1',
        id: 'id1',
        repo_full_name: 'test/repo',
        ticket_number: 1,
        display_id: 'HAL-0001',
        filename: 'ticket1.md',
        title: 'Test Ticket 1',
        body_md: 'Body 1',
        kanban_column_id: 'col-todo',
        kanban_position: 0,
        kanban_moved_at: null,
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockTickets, error: null }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await fetchTickets(mockClient as SupabaseClient, 'test/repo')

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('pk', 'pk1')
    expect(mockClient.from).toHaveBeenCalledWith('tickets')
  })

  it('handles database errors gracefully', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTickets(mockClient as SupabaseClient, 'test/repo')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('handles exceptions gracefully', async () => {
    mockClient.from = vi.fn().mockImplementation(() => {
      throw new Error('Network error')
    })
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTickets(mockClient as SupabaseClient, 'test/repo')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })
})

describe('fetchTicketArtifacts', () => {
  let mockClient: Partial<SupabaseClient>

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
    }
  })

  it('fetches artifacts successfully', async () => {
    const mockArtifacts: SupabaseAgentArtifactRow[] = [
      {
        artifact_id: 'art1',
        ticket_pk: 'ticket1',
        repo_full_name: 'test/repo',
        agent_type: 'implementation',
        title: 'Plan',
        body_md: 'Plan content',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]

    let orderCallCount = 0
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() => {
        orderCallCount++
        if (orderCallCount === 2) {
          // Second order call resolves with data
          return Promise.resolve({ data: mockArtifacts, error: null })
        }
        // First order call returns this for chaining
        return mockQuery
      }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await fetchTicketArtifacts(mockClient as SupabaseClient, 'ticket1')

    expect(result).toEqual(mockArtifacts)
    expect(mockClient.from).toHaveBeenCalledWith('agent_artifacts')
    expect(mockQuery.eq).toHaveBeenCalledWith('ticket_pk', 'ticket1')
  })

  it('returns empty array on database error', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: { message: 'Error' } }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTicketArtifacts(mockClient as SupabaseClient, 'ticket1')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('handles exceptions gracefully', async () => {
    mockClient.from = vi.fn().mockImplementation(() => {
      throw new Error('Network error')
    })
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTicketArtifacts(mockClient as SupabaseClient, 'ticket1')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })
})

describe('fetchTicketAttachments', () => {
  let mockClient: Partial<SupabaseClient>

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
    }
  })

  it('fetches attachments successfully', async () => {
    const mockAttachments: TicketAttachment[] = [
      {
        pk: 'att1',
        ticket_pk: 'ticket1',
        ticket_id: 'HAL-0001',
        filename: 'image.png',
        mime_type: 'image/png',
        data_url: 'data:image/png;base64,...',
        file_size: 1024,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockAttachments, error: null }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await fetchTicketAttachments(mockClient as SupabaseClient, 'HAL-0001')

    expect(result).toEqual(mockAttachments)
    expect(mockClient.from).toHaveBeenCalledWith('ticket_attachments')
    expect(mockQuery.eq).toHaveBeenCalledWith('ticket_id', 'HAL-0001')
  })

  it('returns empty array on database error', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTicketAttachments(mockClient as SupabaseClient, 'HAL-0001')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('handles exceptions gracefully', async () => {
    mockClient.from = vi.fn().mockImplementation(() => {
      throw new Error('Network error')
    })
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchTicketAttachments(mockClient as SupabaseClient, 'HAL-0001')

    expect(result).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })
})

describe('fetchActiveAgentRuns', () => {
  let mockClient: Partial<SupabaseClient>

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
    }
  })

  it('returns empty object when ticketPks is empty', async () => {
    const result = await fetchActiveAgentRuns(mockClient as SupabaseClient, 'test/repo', [])
    expect(result).toEqual({})
    expect(mockClient.from).not.toHaveBeenCalled()
  })

  it('fetches active agent runs and maps by ticket PK', async () => {
    const mockRuns: SupabaseAgentRunRow[] = [
      {
        run_id: 'run1',
        agent_type: 'implementation',
        repo_full_name: 'test/repo',
        ticket_pk: 'ticket1',
        ticket_number: 1,
        display_id: 'HAL-0001',
        status: 'running',
        current_stage: 'running',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      },
      {
        run_id: 'run2',
        agent_type: 'qa',
        repo_full_name: 'test/repo',
        ticket_pk: 'ticket2',
        ticket_number: 2,
        display_id: 'HAL-0002',
        status: 'running',
        current_stage: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRuns, error: null }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await fetchActiveAgentRuns(mockClient as SupabaseClient, 'test/repo', ['ticket1', 'ticket2'])

    expect(result).toHaveProperty('ticket1')
    expect(result).toHaveProperty('ticket2')
    expect(result.ticket1).toEqual(mockRuns[0])
    expect(result.ticket2).toEqual(mockRuns[1])
    expect(mockClient.from).toHaveBeenCalledWith('hal_agent_runs')
  })

  it('keeps only the most recent run when multiple runs exist for same ticket', async () => {
    const mockRuns: SupabaseAgentRunRow[] = [
      {
        run_id: 'run1',
        agent_type: 'implementation',
        repo_full_name: 'test/repo',
        ticket_pk: 'ticket1',
        ticket_number: 1,
        display_id: 'HAL-0001',
        status: 'running',
        current_stage: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        run_id: 'run2',
        agent_type: 'qa',
        repo_full_name: 'test/repo',
        ticket_pk: 'ticket1',
        ticket_number: 1,
        display_id: 'HAL-0001',
        status: 'running',
        current_stage: 'running',
        created_at: '2024-01-02T00:00:00Z', // More recent
        updated_at: '2024-01-02T00:00:00Z',
      },
    ]

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockRuns, error: null }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)

    const result = await fetchActiveAgentRuns(mockClient as SupabaseClient, 'test/repo', ['ticket1'])

    expect(result).toHaveProperty('ticket1')
    expect(result.ticket1.run_id).toBe('run2') // Should keep the more recent one
  })

  it('returns empty object on database error', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
    }

    mockClient.from = vi.fn().mockReturnValue(mockQuery)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchActiveAgentRuns(mockClient as SupabaseClient, 'test/repo', ['ticket1'])

    expect(result).toEqual({})
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('handles exceptions gracefully', async () => {
    mockClient.from = vi.fn().mockImplementation(() => {
      throw new Error('Network error')
    })
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await fetchActiveAgentRuns(mockClient as SupabaseClient, 'test/repo', ['ticket1'])

    expect(result).toEqual({})
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })
})

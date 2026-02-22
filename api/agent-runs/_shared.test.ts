import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateMethod,
  getQueryParam,
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  buildWorklogBodyFromProgress,
  upsertArtifact,
} from './_shared.js'
import type { IncomingMessage, ServerResponse } from 'http'
import type { SupabaseClient } from '@supabase/supabase-js'

const originalEnv = process.env

describe('validateMethod', () => {
  const mockReq = {
    method: 'POST',
  } as IncomingMessage
  const mockRes = {
    statusCode: 200,
    end: vi.fn(),
  } as unknown as ServerResponse

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true for valid method', () => {
    const result = validateMethod(mockReq, mockRes, 'POST')
    expect(result).toBe(true)
    expect(mockRes.end).not.toHaveBeenCalled()
  })

  it('returns false and sends 405 for invalid method', () => {
    const req = { method: 'GET' } as IncomingMessage
    const result = validateMethod(req, mockRes, 'POST')
    expect(result).toBe(false)
    expect(mockRes.statusCode).toBe(405)
    expect(mockRes.end).toHaveBeenCalledWith('Method Not Allowed')
  })
})

describe('getQueryParam', () => {
  it('extracts query parameter', () => {
    const req = {
      url: 'http://localhost/test?param=value',
    } as IncomingMessage
    expect(getQueryParam(req, 'param')).toBe('value')
  })

  it('returns null for missing parameter', () => {
    const req = {
      url: 'http://localhost/test',
    } as IncomingMessage
    expect(getQueryParam(req, 'param')).toBeNull()
  })

  it('returns null for invalid URL', () => {
    const req = {
      url: null,
    } as IncomingMessage
    expect(getQueryParam(req, 'param')).toBeNull()
  })
})

describe('getServerSupabase', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('creates client with SUPABASE_URL and SUPABASE_SECRET_KEY', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'secret-key'
    const client = getServerSupabase()
    expect(client).toBeDefined()
  })

  it('throws error when URL missing', () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    expect(() => getServerSupabase()).toThrow('Supabase server env is missing')
  })

  it('throws error when key missing', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_ANON_KEY
    expect(() => getServerSupabase()).toThrow('Supabase server env is missing')
  })
})

describe('getCursorApiKey', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns CURSOR_API_KEY when set', () => {
    process.env.CURSOR_API_KEY = 'test-key'
    expect(getCursorApiKey()).toBe('test-key')
  })

  it('returns VITE_CURSOR_API_KEY when CURSOR_API_KEY not set', () => {
    delete process.env.CURSOR_API_KEY
    process.env.VITE_CURSOR_API_KEY = 'vite-key'
    expect(getCursorApiKey()).toBe('vite-key')
  })

  it('throws error when key missing', () => {
    delete process.env.CURSOR_API_KEY
    delete process.env.VITE_CURSOR_API_KEY
    expect(() => getCursorApiKey()).toThrow('Cursor API is not configured')
  })

  it('trims whitespace', () => {
    process.env.CURSOR_API_KEY = '  test-key  '
    expect(getCursorApiKey()).toBe('test-key')
  })
})

describe('humanReadableCursorError', () => {
  it('handles 401 error', () => {
    expect(humanReadableCursorError(401)).toContain('authentication failed')
  })

  it('handles 403 error', () => {
    expect(humanReadableCursorError(403)).toContain('access denied')
  })

  it('handles 429 error', () => {
    expect(humanReadableCursorError(429)).toContain('rate limit')
  })

  it('handles 500+ errors', () => {
    expect(humanReadableCursorError(500)).toContain('server error')
    expect(humanReadableCursorError(502)).toContain('server error')
  })

  it('handles other status codes', () => {
    expect(humanReadableCursorError(404)).toContain('request failed')
  })

  it('includes detail when provided', () => {
    const result = humanReadableCursorError(404, 'Not found')
    expect(result).toContain('Not found')
  })

  it('truncates long details', () => {
    const longDetail = 'x'.repeat(200)
    const result = humanReadableCursorError(404, longDetail)
    expect(result.length).toBeLessThan(200)
  })
})

describe('appendProgress', () => {
  it('adds message to empty array', () => {
    const result = appendProgress(null, 'Test message')
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('Test message')
  })

  it('adds message to existing array', () => {
    const existing = [{ at: '2024-01-01T00:00:00Z', message: 'First' }]
    const result = appendProgress(existing, 'Second')
    expect(result).toHaveLength(2)
    expect(result[1].message).toBe('Second')
  })

  it('limits to 50 entries', () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      at: '2024-01-01T00:00:00Z',
      message: `Message ${i}`,
    }))
    const result = appendProgress(existing, 'New message')
    expect(result).toHaveLength(50)
    expect(result[49].message).toBe('New message')
    expect(result[0].message).toBe('Message 1') // First entry removed
  })

  it('includes timestamp', () => {
    const result = appendProgress(null, 'Test')
    expect(result[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('buildWorklogBodyFromProgress', () => {
  it('builds worklog from progress entries', () => {
    const progress = [
      { at: '2024-01-01T00:00:00Z', message: 'Step 1' },
      { at: '2024-01-01T00:01:00Z', message: 'Step 2' },
    ]
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'succeeded')
    expect(body).toContain('HAL-0123')
    expect(body).toContain('Step 1')
    expect(body).toContain('Step 2')
    expect(body).toContain('succeeded')
  })

  it('handles empty progress', () => {
    const body = buildWorklogBodyFromProgress('HAL-0123', [], 'succeeded')
    expect(body).toContain('HAL-0123')
  })

  it('handles empty progress array', () => {
    const body = buildWorklogBodyFromProgress('HAL-0123', [], 'succeeded')
    expect(body).toContain('HAL-0123')
    expect(body).toContain('## Progress')
  })
})

describe('upsertArtifact', () => {
  const ticketPk = 'ticket-123'
  const repoFullName = 'test/repo'
  const agentType = 'implementation'
  const validBody = 'This is a valid artifact body with enough content to pass validation. It has more than 50 characters.'
  
  it('rejects empty or placeholder content before any database operations', async () => {
    const mockSupabase = { from: vi.fn() } as any

    const shortBody = 'Short'
    const placeholderBody = '(none)'

    const result1 = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      shortBody
    )

    expect(result1.ok).toBe(false)
    expect(result1.error).toContain('validation failed')
    expect(mockSupabase.from).not.toHaveBeenCalled()

    const result2 = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      placeholderBody
    )

    expect(result2.ok).toBe(false)
    expect(result2.error).toContain('validation failed')
  })

  it('inserts new artifact when no existing artifacts found by canonical ID', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }
    const mockArtifactQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            ...mockArtifactQuery,
            insert: mockInsert,
          }
        }
        return {}
      }),
    } as any

    // Mock the findArtifactsByCanonicalId function
    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({ 
      artifacts: [], 
      error: null 
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('updates existing artifact when one with substantive content exists', async () => {
    const existingArtifact = {
      artifact_id: 'artifact-123',
      body_md: 'Existing content that is valid and has enough characters to pass validation.',
      created_at: '2024-01-01T00:00:00Z',
    }

    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({
      eq: mockUpdateEq,
    })

    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            update: mockUpdate,
          }
        }
        return {}
      }),
    } as any

    // Mock findArtifactsByCanonicalId to return existing artifact
    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({
      artifacts: [existingArtifact],
      error: null,
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('deletes empty placeholder artifacts before inserting new content', async () => {
    const emptyArtifact = {
      artifact_id: 'empty-123',
      body_md: '(none)',
      created_at: '2024-01-01T00:00:00Z',
    }

    const mockDeleteIn = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({
      in: mockDeleteIn,
    })

    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            delete: mockDelete,
            insert: mockInsert,
          }
        }
        return {}
      }),
    } as any

    // Mock findArtifactsByCanonicalId to return empty artifact
    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({
      artifacts: [emptyArtifact],
      error: null,
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalled()
  })

  it('normalizes title to canonical format when artifact type is extractable', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: 'HAL-0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            insert: mockInsert,
          }
        }
        return {}
      }),
    } as any

    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({ 
      artifacts: [], 
      error: null 
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket HAL-0127', // Variant title
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
    // Verify canonical title was used (normalized display_id)
    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall.title).toBe('Plan for ticket 0127') // Canonical format
  })

  it('updates existing artifact with substantive content instead of inserting duplicate', async () => {
    const existingArtifact = {
      artifact_id: 'artifact-123',
      body_md: 'Existing substantive content that is valid and has enough characters to pass validation checks.',
      created_at: '2024-01-01T00:00:00Z',
    }

    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({
      eq: mockUpdateEq,
    })

    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            update: mockUpdate,
          }
        }
        return {}
      }),
    } as any

    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({
      artifacts: [existingArtifact],
      error: null,
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockUpdateEq).toHaveBeenCalledWith('artifact_id', 'artifact-123')
  })

  it('handles duplicate key error by finding and updating existing artifact', async () => {
    const duplicateError = {
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    }

    const mockInsert = vi.fn().mockResolvedValue({ error: duplicateError })
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({
      eq: mockUpdateEq,
    })

    // Create proper query builder chain for duplicate error handling
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { artifact_id: 'existing-123' }, 
      error: null 
    })
    const mockLimit = vi.fn().mockReturnValue({
      single: mockSingle,
    })
    const mockOrder = vi.fn().mockReturnValue({
      limit: mockLimit,
    })
    const mockEq3 = vi.fn().mockReturnValue({
      order: mockOrder,
    })
    const mockEq2 = vi.fn().mockReturnValue({
      eq: mockEq3,
    })
    const mockEq1 = vi.fn().mockReturnValue({
      eq: mockEq2,
    })
    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq1,
    })

    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            insert: mockInsert,
            select: mockSelect,
            update: mockUpdate,
          }
        }
        return {}
      }),
    } as any

    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({ 
      artifacts: [], 
      error: null 
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('deletes multiple empty artifacts when multiple placeholders exist', async () => {
    const emptyArtifacts = [
      {
        artifact_id: 'empty-1',
        body_md: '(none)',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: 'empty-2',
        body_md: 'Short',
        created_at: '2024-01-01T00:01:00Z',
      },
    ]

    const mockDeleteIn = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({
      in: mockDeleteIn,
    })

    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockTicketQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { display_id: '0127' }, 
        error: null 
      }),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'tickets') return mockTicketQuery
        if (table === 'agent_artifacts') {
          return {
            delete: mockDelete,
            insert: mockInsert,
          }
        }
        return {}
      }),
    } as any

    const artifactShared = await import('../artifacts/_shared.js')
    vi.spyOn(artifactShared, 'findArtifactsByCanonicalId').mockResolvedValue({
      artifacts: emptyArtifacts,
      error: null,
    })

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Plan for ticket 0127',
      validBody
    )

    expect(result.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteIn).toHaveBeenCalledWith('artifact_id', ['empty-1', 'empty-2'])
    expect(mockInsert).toHaveBeenCalled()
  })

  it('falls back to exact title matching when artifact type cannot be extracted', async () => {
    // Create proper query builder chain for exact title matching
    const mockOrder = vi.fn().mockResolvedValue({ 
      data: [], 
      error: null 
    })
    const mockEq3 = vi.fn().mockReturnValue({
      order: mockOrder,
    })
    const mockEq2 = vi.fn().mockReturnValue({
      eq: mockEq3,
    })
    const mockEq1 = vi.fn().mockReturnValue({
      eq: mockEq2,
    })
    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq1,
    })

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: mockSelect,
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return {}
      }),
    } as any

    const result = await upsertArtifact(
      mockSupabase,
      ticketPk,
      repoFullName,
      agentType,
      'Custom Title Without Pattern', // No extractable artifact type
      validBody
    )

    expect(result.ok).toBe(true)
    // Should use exact title matching (not canonical)
    expect(mockSelect).toHaveBeenCalled()
  })
})

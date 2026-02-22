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
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'succeeded', 'Summary text', null, null)
    expect(body).toContain('HAL-0123')
    expect(body).toContain('Step 1')
    expect(body).toContain('Step 2')
    expect(body).toContain('succeeded')
  })

  it('handles empty progress', () => {
    const body = buildWorklogBodyFromProgress('HAL-0123', [], 'succeeded', null, null, null)
    expect(body).toContain('HAL-0123')
  })

  it('handles empty progress array', () => {
    const body = buildWorklogBodyFromProgress('HAL-0123', [], 'succeeded', null, null, null)
    expect(body).toContain('HAL-0123')
    expect(body).toContain('## Progress')
  })
})

describe('upsertArtifact', () => {
  let mockSupabase: SupabaseClient<any, 'public', any>
  const ticketPk = 'ticket-123'
  const repoFullName = 'test/repo'
  const agentType = 'implementation'
  const validBody = 'This is a valid artifact body with enough content to pass validation. It has more than 50 characters.'

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    } as unknown as SupabaseClient<any, 'public', any>
  })

  describe('validation behavior', () => {
    it('rejects empty body_md', async () => {
      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', '')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('validation failed')
      }
    })

    it('rejects body_md that is too short', async () => {
      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', 'Short')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('too short')
      }
    })

    it('rejects placeholder content', async () => {
      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', '(none)')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('placeholder')
      }
    })
  })

  describe('canonical title matching behavior', () => {
    it('finds existing artifact by canonical title when artifact type is extractable', async () => {
      // Mock ticket lookup
      const mockTicket = { display_id: 'HAL-0123' }
      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
          }
        }
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { artifact_id: 'artifact-1', body_md: validBody, created_at: '2024-01-01' },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return mockSupabase
      })

      // Mock findArtifactsByCanonicalId to return existing artifact
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [{ artifact_id: 'artifact-1', body_md: validBody, created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' }],
        error: null,
      })

      const result = await upsertArtifact(
        mockSupabase,
        ticketPk,
        repoFullName,
        agentType,
        'Plan for ticket HAL-0123',
        validBody
      )

      // Should update existing artifact
      expect(mockSupabase.from).toHaveBeenCalledWith('agent_artifacts')
    })

    it('falls back to exact title matching when artifact type cannot be extracted', async () => {
      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: [{ artifact_id: 'artifact-1', body_md: validBody, created_at: '2024-01-01' }],
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return mockSupabase
      })

      const result = await upsertArtifact(
        mockSupabase,
        ticketPk,
        repoFullName,
        agentType,
        'Custom Title Without Type',
        validBody
      )

      expect(mockSupabase.from).toHaveBeenCalledWith('agent_artifacts')
    })
  })

  describe('empty artifact deletion behavior', () => {
    it('deletes empty/placeholder artifacts before updating', async () => {
      const emptyArtifact = { artifact_id: 'empty-1', body_md: '(none)', created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' }
      const validArtifact = { artifact_id: 'valid-1', body_md: validBody, created_at: '2024-01-02', title: 'Plan for ticket HAL-0123' }

      let deleteCalled = false
      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: [emptyArtifact, validArtifact],
              error: null,
            }),
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockImplementation(() => {
              deleteCalled = true
              return { error: null }
            }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { display_id: 'HAL-0123' },
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // Mock findArtifactsByCanonicalId
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [emptyArtifact, validArtifact],
        error: null,
      })

      await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', validBody)

      expect(deleteCalled).toBe(true)
    })

    it('handles deletion errors gracefully and continues with update', async () => {
      const emptyArtifact = { artifact_id: 'empty-1', body_md: '(none)', created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' }

      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: [emptyArtifact],
              error: null,
            }),
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              error: { message: 'Delete failed' },
            }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { display_id: 'HAL-0123' },
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // Mock findArtifactsByCanonicalId
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [emptyArtifact],
        error: null,
      })

      // Should still proceed even if deletion fails
      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', validBody)
      // Result depends on whether update/insert succeeds, but deletion error shouldn't block it
      expect(mockSupabase.from).toHaveBeenCalled()
    })
  })

  describe('update vs insert behavior', () => {
    it('updates existing artifact with content when found', async () => {
      const existingArtifact = { artifact_id: 'artifact-1', body_md: validBody, created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' }
      let updateCalled = false

      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: [existingArtifact],
              error: null,
            }),
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn(),
          }
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { display_id: 'HAL-0123' },
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // Mock the update chain
      const updateChain = {
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      ;(mockSupabase.from('agent_artifacts').update as any) = vi.fn().mockReturnValue(updateChain)

      // Mock findArtifactsByCanonicalId
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [existingArtifact],
        error: null,
      })

      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', validBody)

      expect(result.ok).toBe(true)
    })

    it('inserts new artifact when no existing artifact found', async () => {
      let insertCalled = false

      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockImplementation(() => {
              insertCalled = true
              return Promise.resolve({ data: null, error: null })
            }),
          }
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { display_id: 'HAL-0123' },
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // Mock findArtifactsByCanonicalId
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [],
        error: null,
      })

      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', validBody)

      expect(insertCalled).toBe(true)
      expect(result.ok).toBe(true)
    })

    it('handles race condition on insert by retrying with update', async () => {
      const existingArtifact = { artifact_id: 'artifact-1' }
      let insertAttempted = false
      let updateCalled = false

      const mockEqForSelect = vi.fn().mockReturnThis()
      const mockOrder = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: existingArtifact,
        error: null,
      })

      const mockEqForUpdate = vi.fn().mockImplementation(() => {
        updateCalled = true
        return Promise.resolve({ error: null })
      })
      const mockUpdateChain = {
        eq: mockEqForUpdate,
      }
      const mockUpdate = vi.fn().mockReturnValue(mockUpdateChain)

      ;(mockSupabase.from as any).mockImplementation((table: string) => {
        if (table === 'agent_artifacts') {
          const baseChain = {
            select: vi.fn().mockReturnThis(),
            eq: mockEqForSelect,
            order: mockOrder,
            maybeSingle: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
            single: mockSingle,
            limit: mockLimit,
            delete: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ error: null }),
            update: mockUpdate,
            insert: vi.fn().mockImplementation(() => {
              insertAttempted = true
              // Simulate duplicate key error
              return Promise.resolve({
                data: null,
                error: { message: 'duplicate key value violates unique constraint', code: '23505' },
              })
            }),
          }
          // Make eq chainable for select queries
          mockEqForSelect.mockReturnValue(baseChain)
          return baseChain
        }
        if (table === 'tickets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { display_id: 'HAL-0123' },
              error: null,
            }),
          }
        }
        return mockSupabase
      })

      // Mock findArtifactsByCanonicalId
      vi.spyOn(await import('../artifacts/_shared.js'), 'findArtifactsByCanonicalId').mockResolvedValue({
        artifacts: [],
        error: null,
      })

      const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, 'Plan for ticket HAL-0123', validBody)

      expect(insertAttempted).toBe(true)
      expect(updateCalled).toBe(true)
      expect(result.ok).toBe(true)
    })
  })
})

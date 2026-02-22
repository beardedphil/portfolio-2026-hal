import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateMethod,
  getQueryParam,
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  buildWorklogBodyFromProgress,
  readJsonBody,
  upsertArtifact,
  json,
} from './_shared.js'
import type { IncomingMessage, ServerResponse } from 'http'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as artifactsShared from '../artifacts/_shared.js'
import * as artifactsValidation from '../artifacts/_validation.js'

vi.mock('../artifacts/_shared.js')
vi.mock('../artifacts/_validation.js')

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
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'succeeded', null, null, null)
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

  it('includes summary when provided', () => {
    const progress = [{ at: '2024-01-01T00:00:00Z', message: 'Step 1' }]
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'succeeded', 'This is a summary', null, null)
    expect(body).toContain('## Summary')
    expect(body).toContain('This is a summary')
  })

  it('includes error message when provided', () => {
    const progress = [{ at: '2024-01-01T00:00:00Z', message: 'Step 1' }]
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'failed', null, 'Error occurred', null)
    expect(body).toContain('## Error')
    expect(body).toContain('Error occurred')
  })

  it('includes PR URL when provided', () => {
    const progress = [{ at: '2024-01-01T00:00:00Z', message: 'Step 1' }]
    const body = buildWorklogBodyFromProgress('HAL-0123', progress, 'succeeded', null, null, 'https://github.com/test/repo/pull/123')
    expect(body).toContain('**Pull request:**')
    expect(body).toContain('https://github.com/test/repo/pull/123')
  })

  it('includes all optional fields when provided', () => {
    const progress = [{ at: '2024-01-01T00:00:00Z', message: 'Step 1' }]
    const body = buildWorklogBodyFromProgress(
      'HAL-0123',
      progress,
      'succeeded',
      'Summary text',
      'Error text',
      'https://github.com/test/repo/pull/123'
    )
    expect(body).toContain('## Summary')
    expect(body).toContain('Summary text')
    expect(body).toContain('## Error')
    expect(body).toContain('Error text')
    expect(body).toContain('**Pull request:**')
    expect(body).toContain('https://github.com/test/repo/pull/123')
  })
})

describe('json', () => {
  it('sends JSON response with status code', () => {
    const mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    json(mockRes, 200, { key: 'value' })

    expect(mockRes.statusCode).toBe(200)
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(mockRes.end).toHaveBeenCalledWith('{"key":"value"}')
  })

  it('handles different status codes', () => {
    const mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    json(mockRes, 404, { error: 'Not found' })

    expect(mockRes.statusCode).toBe(404)
    expect(mockRes.end).toHaveBeenCalledWith('{"error":"Not found"}')
  })

  it('handles complex objects', () => {
    const mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    const complexObj = { nested: { array: [1, 2, 3], value: 'test' } }
    json(mockRes, 200, complexObj)

    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(complexObj))
  })
})

describe('readJsonBody', () => {
  it('parses valid JSON body', async () => {
    const chunks = [Buffer.from('{"key":"value"}')]
    const req = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    } as IncomingMessage
    const result = await readJsonBody(req)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns empty object for empty body', async () => {
    const req = {
      [Symbol.asyncIterator]: async function* () {
        // No chunks
      },
    } as IncomingMessage
    const result = await readJsonBody(req)
    expect(result).toEqual({})
  })

  it('handles string chunks', async () => {
    const chunks = ['{"test":', ' "data"}']
    const req = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    } as IncomingMessage
    const result = await readJsonBody(req)
    expect(result).toEqual({ test: 'data' })
  })

  it('trims whitespace from body', async () => {
    const chunks = [Buffer.from('  {"key":"value"}  ')]
    const req = {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      },
    } as IncomingMessage
    const result = await readJsonBody(req)
    expect(result).toEqual({ key: 'value' })
  })
})

describe('upsertArtifact', () => {
  let mockSupabase: any
  const ticketPk = 'ticket-123'
  const repoFullName = 'test/repo'
  const agentType = 'implementation'
  const title = 'Plan for ticket HAL-0123'
  const bodyMd = 'This is a substantive artifact body with enough content to pass validation. It contains actual meaningful information about the plan.'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(artifactsValidation.hasSubstantiveContent).mockImplementation((body, title) => {
      // Default: return valid for substantive content
      if (!body || body.trim().length < 50) return { valid: false, reason: 'too short' }
      if (body.includes('(none)')) return { valid: false, reason: 'placeholder' }
      return { valid: true }
    })
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      order: vi.fn(() => mockSupabase),
      maybeSingle: vi.fn(),
      limit: vi.fn(() => mockSupabase),
      single: vi.fn(),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
      insert: vi.fn(() => ({ error: null })),
      delete: vi.fn(() => ({
        in: vi.fn(() => ({ error: null })),
      })),
    }
  })

  it('rejects artifact with insufficient content (too short)', async () => {
    vi.mocked(artifactsValidation.hasSubstantiveContent).mockReturnValue({ valid: false, reason: 'too short' })
    const shortBody = 'Too short'
    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, shortBody)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('validation failed')
  })

  it('rejects artifact with placeholder content', async () => {
    vi.mocked(artifactsValidation.hasSubstantiveContent).mockReturnValue({ valid: false, reason: 'placeholder' })
    const placeholderBody = '(none)'
    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, placeholderBody)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('validation failed')
  })

  it('rejects empty artifact body', async () => {
    vi.mocked(artifactsValidation.hasSubstantiveContent).mockReturnValue({ valid: false, reason: 'empty' })
    const emptyBody = ''
    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, emptyBody)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('validation failed')
  })

  it('inserts new artifact when none exists', async () => {
    vi.mocked(artifactsShared.extractArtifactTypeFromTitle).mockReturnValue(null)

    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.order.mockReturnValue({ data: [], error: null })

    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, bodyMd)

    expect(result.ok).toBe(true)
    expect(mockSupabase.insert).toHaveBeenCalled()
  })

  it('updates existing artifact when found by canonical title', async () => {
    vi.mocked(artifactsShared.extractArtifactTypeFromTitle).mockReturnValue('plan')
    vi.mocked(artifactsShared.createCanonicalTitle).mockReturnValue('Plan for ticket HAL-0123')
    vi.mocked(artifactsShared.findArtifactsByCanonicalId).mockResolvedValue({
      artifacts: [{ artifact_id: 'existing-id', body_md: bodyMd, created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' }],
      error: null,
    })

    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.maybeSingle.mockResolvedValue({ data: { display_id: 'HAL-0123' }, error: null })

    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, bodyMd)

    expect(result.ok).toBe(true)
    expect(mockSupabase.update).toHaveBeenCalled()
  })

  it('handles duplicate key error by updating existing artifact', async () => {
    vi.mocked(artifactsShared.extractArtifactTypeFromTitle).mockReturnValue(null)

    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.order.mockReturnValue(mockSupabase)
    mockSupabase.limit.mockReturnValue(mockSupabase)
    mockSupabase.single.mockResolvedValue({ data: { artifact_id: 'existing-id' }, error: null })
    mockSupabase.insert.mockReturnValue({ error: { message: 'duplicate key', code: '23505' } })

    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, bodyMd)

    expect(result.ok).toBe(true)
    expect(mockSupabase.update).toHaveBeenCalled()
  })

  it('cleans up empty artifacts before updating', async () => {
    vi.mocked(artifactsShared.extractArtifactTypeFromTitle).mockReturnValue('plan')
    vi.mocked(artifactsShared.createCanonicalTitle).mockReturnValue('Plan for ticket HAL-0123')
    vi.mocked(artifactsShared.findArtifactsByCanonicalId).mockResolvedValue({
      artifacts: [
        { artifact_id: 'empty-id', body_md: '(none)', created_at: '2024-01-01', title: 'Plan for ticket HAL-0123' },
        { artifact_id: 'valid-id', body_md: bodyMd, created_at: '2024-01-02', title: 'Plan for ticket HAL-0123' },
      ],
      error: null,
    })
    vi.mocked(artifactsValidation.hasSubstantiveContent).mockImplementation((body, title) => {
      if (body === '(none)') return { valid: false, reason: 'placeholder' }
      return { valid: true }
    })

    mockSupabase.from.mockReturnValue(mockSupabase)
    mockSupabase.select.mockReturnValue(mockSupabase)
    mockSupabase.eq.mockReturnValue(mockSupabase)
    mockSupabase.maybeSingle.mockResolvedValue({ data: { display_id: 'HAL-0123' }, error: null })

    const result = await upsertArtifact(mockSupabase, ticketPk, repoFullName, agentType, title, bodyMd)

    expect(result.ok).toBe(true)
    expect(mockSupabase.delete).toHaveBeenCalled()
    expect(mockSupabase.update).toHaveBeenCalled()
  })
})

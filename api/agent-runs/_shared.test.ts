import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateMethod,
  getQueryParam,
  getServerSupabase,
  getCursorApiKey,
  humanReadableCursorError,
  appendProgress,
  buildWorklogBodyFromProgress,
} from './_shared.js'
import type { IncomingMessage, ServerResponse } from 'http'

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

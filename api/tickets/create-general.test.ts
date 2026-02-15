/**
 * Unit tests for api/tickets/create-general.ts handler.
 * Tests ticket ID generation, required fields validation, kanban_column_id handling,
 * and display ID formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(),
  }
})

// Import handler after mocking
import handler from './create-general.js'

// Helper to create a mock request
function createMockRequest(body: unknown, method = 'POST'): IncomingMessage {
  return {
    method,
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify(body))
    },
  } as unknown as IncomingMessage
}

// Helper to create a mock response
function createMockResponse(): ServerResponse & {
  getResponseData: () => unknown
  getStatusCode: () => number
} {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let responseBody: unknown = null

  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value
    }),
    get statusCode() {
      return statusCode
    },
    set statusCode(value: number) {
      statusCode = value
    },
    end: vi.fn((body?: string) => {
      if (body) {
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }
    }),
    getResponseData: () => responseBody,
    getStatusCode: () => statusCode,
  } as unknown as ServerResponse & {
    getResponseData: () => unknown
    getStatusCode: () => number
  }
}

// Helper to create a mock Supabase client
function createMockSupabaseClient(mockData: {
  existingTicketNumber?: number
  insertSuccess?: boolean
  insertError?: { code?: string; message?: string } | null
}) {
  const mockInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(
        mockData.insertSuccess !== false
          ? {
              data: { pk: 'test-pk-123' },
              error: mockData.insertError || null,
            }
          : {
              data: null,
              error: mockData.insertError || null,
            }
      ),
    }),
  })

  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data:
              mockData.existingTicketNumber !== undefined
                ? [{ ticket_number: mockData.existingTicketNumber }]
                : [],
            error: null,
          }),
        }),
      }),
    }),
    insert: mockInsert,
  })

  const mockClient = {
    from: mockFrom,
  }

  vi.mocked(createClient).mockReturnValue(mockClient as any)

  return { mockClient, mockFrom, mockInsert }
}

describe('create-general handler', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('required fields validation', () => {
    it('returns 400 when title is missing', async () => {
      const req = createMockRequest({
        body_md: 'Test body',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })

    it('returns 400 when body_md is missing', async () => {
      const req = createMockRequest({
        title: 'Test title',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })

    it('returns 400 when both title and body_md are missing', async () => {
      const req = createMockRequest({
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })

    it('returns 400 when title is empty string', async () => {
      const req = createMockRequest({
        title: '',
        body_md: 'Test body',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })

    it('returns 400 when body_md is empty string', async () => {
      const req = createMockRequest({
        title: 'Test title',
        body_md: '',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })

    it('returns 400 when title is only whitespace', async () => {
      const req = createMockRequest({
        title: '   ',
        body_md: 'Test body',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(400)
      const responseData = res.getResponseData() as { success: boolean; error: string }
      expect(responseData.success).toBe(false)
      expect(responseData.error).toContain('title and body_md are required')
    })
  })

  describe('kanban_column_id handling', () => {
    it('uses provided kanban_column_id when specified', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 100 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        kanban_column_id: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.kanban_column_id).toBe('col-todo')
    })

    it('defaults to col-unassigned when kanban_column_id is omitted', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 100 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.kanban_column_id).toBe('col-unassigned')
    })

    it('defaults to col-unassigned when kanban_column_id is empty string', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 100 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        kanban_column_id: '',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.kanban_column_id).toBe('col-unassigned')
    })
  })

  describe('display ID formatting and title prefixing', () => {
    it('formats display ID with HAL prefix for portfolio-2026-hal repo', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 615 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        repo_full_name: 'beardedphil/portfolio-2026-hal',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      
      // Display ID should be HAL-0616 (next number after 615)
      expect(insertCall.display_id).toBe('HAL-0616')
      // Title should be prefixed with display ID
      expect(insertCall.title).toBe('HAL-0616 — Test title')
    })

    it('formats display ID correctly for first ticket (no existing tickets)', async () => {
      const { mockInsert } = createMockSupabaseClient({})

      const req = createMockRequest({
        title: 'First ticket',
        body_md: 'Test body',
        repo_full_name: 'beardedphil/portfolio-2026-hal',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      
      // First ticket should be HAL-0001
      expect(insertCall.display_id).toBe('HAL-0001')
      expect(insertCall.title).toBe('HAL-0001 — First ticket')
    })

    it('formats display ID with correct prefix derived from repo name', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 5 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        repo_full_name: 'beardedphil/portfolio-2026-hal',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      
      // Should use HAL prefix for portfolio-2026-hal repo
      expect(insertCall.display_id).toMatch(/^HAL-\d{4}$/)
      expect(insertCall.display_id).toBe('HAL-0006')
      expect(insertCall.title).toBe('HAL-0006 — Test title')
    })

    it('pads ticket number to 4 digits in display ID', async () => {
      const { mockInsert } = createMockSupabaseClient({ existingTicketNumber: 42 })

      const req = createMockRequest({
        title: 'Test title',
        body_md: 'Test body',
        repo_full_name: 'beardedphil/portfolio-2026-hal',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(200)
      expect(mockInsert).toHaveBeenCalled()
      const insertCall = mockInsert.mock.calls[0][0]
      
      // Should pad to 4 digits: 0043
      expect(insertCall.display_id).toBe('HAL-0043')
      expect(insertCall.title).toBe('HAL-0043 — Test title')
    })
  })

  describe('method validation', () => {
    it('handles OPTIONS request', async () => {
      const req = createMockRequest({}, 'OPTIONS')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(204)
    })

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({ title: 'Test', body_md: 'Test' }, 'GET')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.getStatusCode()).toBe(405)
    })
  })
})

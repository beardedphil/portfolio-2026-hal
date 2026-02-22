/**
 * Unit tests for create-from-suggestion.ts endpoint.
 * Tests ticket creation from process review suggestions with idempotency and retry logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import handler from './create-from-suggestion.js'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

describe('create-from-suggestion handler', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let mockSupabase: any
  let responseData: string
  let responseStatus: number
  let responseHeaders: Record<string, string>

  beforeEach(() => {
    responseData = ''
    responseStatus = 200
    responseHeaders = {}

    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{}')
      },
    }

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn((name: string, value: string) => {
        responseHeaders[name] = value
      }),
      end: vi.fn((data?: string) => {
        responseData = data || ''
      }),
    }

    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      like: vi.fn(() => mockSupabase),
      order: vi.fn(() => mockSupabase),
      limit: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      maybeSingle: vi.fn(),
    }

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)
  })

  describe('CORS headers', () => {
    it('sets CORS headers for all requests', async () => {
      mockReq.method = 'OPTIONS'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('{}')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
    })

    it('handles OPTIONS request', async () => {
      mockReq.method = 'OPTIONS'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('{}')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalledWith()
    })

    it('rejects non-POST methods', async () => {
      mockReq.method = 'GET'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('{}')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(responseData).toBe('Method Not Allowed')
    })
  })

  describe('request validation', () => {
    it('requires sourceTicketPk or sourceTicketId', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('sourceTicketPk')
    })

    it('requires Supabase credentials', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Supabase credentials')
    })

    it('requires non-empty suggestion', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: '',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('suggestion is required')
    })

    it('trims whitespace from input fields', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '  123  ',
          suggestion: '  Test suggestion  ',
          supabaseUrl: '  https://test.supabase.co  ',
          supabaseAnonKey: '  test-key  ',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.eq).toHaveBeenCalledWith('id', '123')
    })
  })

  describe('source ticket lookup', () => {
    it('looks up ticket by sourceTicketPk when provided', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketPk: 'pk-123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.eq).toHaveBeenCalledWith('pk', 'pk-123')
    })

    it('looks up ticket by sourceTicketId when pk not provided', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.eq).toHaveBeenCalledWith('id', '123')
    })

    it('returns error when source ticket not found', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Source ticket not found')
    })
  })

  describe('idempotency check', () => {
    it('checks for existing ticket when reviewId and suggestionIndex provided', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      
      // Mock the chain: like().like().limit(1) returns promise
      const idempotencyChain = {
        like: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }
      mockSupabase.like.mockReturnValue(idempotencyChain)
      
      // Also need to mock order/limit for ticket number query
      const orderLimitChain = {
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }
      mockSupabase.order.mockReturnValue(orderLimitChain)
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          reviewId: 'review-123',
          suggestionIndex: 0,
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.like).toHaveBeenCalledWith('body_md', '%review_id: review-123%')
      expect(idempotencyChain.like).toHaveBeenCalledWith('body_md', '%suggestion_index: 0%')
    })

    it('returns existing ticket when found (idempotency)', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })

      // Mock the chain for idempotency check: like().like().limit(1)
      const idempotencyChain = {
        like: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ pk: 'pk-456', id: '456', display_id: 'HAL-0456' }],
          error: null,
        }),
      }
      mockSupabase.like.mockReturnValue(idempotencyChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          reviewId: 'review-123',
          suggestionIndex: 0,
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const body = JSON.parse(responseData)
      expect(body.success).toBe(true)
      expect(body.skipped).toBe(true)
      expect(body.reason).toContain('already exists')
    })

    it('skips idempotency check when reviewId or suggestionIndex missing', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          reviewId: 'review-123',
          // suggestionIndex missing
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should not call like() for idempotency check
      const likeCalls = mockSupabase.like.mock.calls.filter(
        (call: any[]) => call[0] === 'body_md'
      )
      expect(likeCalls.length).toBe(0)
    })
  })

  describe('ticket number determination', () => {
    it('starts at 1 when no existing tickets', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      // Mock the chain: order() returns this, limit() returns promise
      const orderLimitChain = {
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }
      mockSupabase.order.mockReturnValue(orderLimitChain)
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify insert was called with ticket_number: 1
      expect(mockSupabase.insert).toHaveBeenCalled()
      const insertCall = mockSupabase.insert.mock.calls[0][0]
      expect(insertCall.ticket_number).toBe(1)
    })

    it('increments from max ticket number', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      // Mock the chain: order() returns this, limit() returns promise
      const orderLimitChain = {
        limit: vi.fn().mockResolvedValue({
          data: [{ ticket_number: 42 }],
          error: null,
        }),
      }
      mockSupabase.order.mockReturnValue(orderLimitChain)
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const insertCall = mockSupabase.insert.mock.calls[0][0]
      expect(insertCall.ticket_number).toBe(43)
    })

    it('falls back to 1 if query fails', async () => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      mockSupabase.order.mockRejectedValue(new Error('Query failed'))
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const insertCall = mockSupabase.insert.mock.calls[0][0]
      expect(insertCall.ticket_number).toBe(1)
    })
  })

  describe('ticket creation', () => {
    beforeEach(() => {
      mockSupabase.maybeSingle.mockResolvedValue({
        data: { pk: 'pk-123', id: '123', display_id: 'HAL-0123', repo_full_name: 'test/repo' },
        error: null,
      })
      // Mock the chain: order() returns this, limit() returns promise
      const orderLimitChain = {
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }
      mockSupabase.order.mockReturnValue(orderLimitChain)
    })

    it('creates ticket with correct structure', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.insert).toHaveBeenCalled()
      const insertCall = mockSupabase.insert.mock.calls[0][0]
      expect(insertCall.repo_full_name).toBe('test/repo')
      expect(insertCall.ticket_number).toBe(1)
      expect(insertCall.title).toContain('Test suggestion')
      expect(insertCall.body_md).toContain('Test suggestion')
      expect(insertCall.kanban_column_id).toBe('col-unassigned')
    })

    it('includes reviewId and suggestionIndex in body when provided', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          reviewId: 'review-123',
          suggestionIndex: 5,
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const insertCall = mockSupabase.insert.mock.calls[0][0]
      expect(insertCall.body_md).toContain('**Review ID**: review-123')
      expect(insertCall.body_md).toContain('**Suggestion Index**: 5')
    })

    it('truncates long suggestions to 80 characters in title', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null })

      const longSuggestion = 'a'.repeat(100)
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: longSuggestion,
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const insertCall = mockSupabase.insert.mock.calls[0][0]
      // Title format: "PREFIX-0001 — {truncated suggestion}"
      // Should be truncated to 77 chars + "..." = 80 chars for suggestion part
      const titleParts = insertCall.title.split(' — ')
      expect(titleParts.length).toBe(2)
      expect(titleParts[1].length).toBe(80) // 77 chars + "..."
      expect(titleParts[1]).toContain('...')
    })

    it('retries on unique violation errors', async () => {
      // First attempt fails with unique violation
      mockSupabase.insert
        .mockResolvedValueOnce({
          error: { code: '23505', message: 'duplicate key' },
        })
        .mockResolvedValueOnce({ error: null }) // Second attempt succeeds

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.insert).toHaveBeenCalledTimes(2)
      const body = JSON.parse(responseData)
      expect(body.success).toBe(true)
    })

    it('fails after max retries', async () => {
      // All attempts fail with unique violation
      mockSupabase.insert.mockResolvedValue({
        error: { code: '23505', message: 'duplicate key' },
      })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.insert).toHaveBeenCalledTimes(10) // MAX_RETRIES
      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Could not create ticket after')
    })

    it('returns error for non-unique violation errors', async () => {
      mockSupabase.insert.mockResolvedValue({
        error: { code: '23503', message: 'foreign key violation' },
      })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Failed to create ticket')
      // Should not retry for non-unique errors
      expect(mockSupabase.insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('handles JSON parse errors', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('invalid json{')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(500)
      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
    })

    it('handles unexpected errors', async () => {
      vi.mocked(createClient).mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          sourceTicketId: '123',
          suggestion: 'Test suggestion',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(500)
      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Unexpected error')
    })
  })
})

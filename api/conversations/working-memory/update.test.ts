/**
 * Unit tests for working memory update endpoint.
 * Tests validation, request handling, and OpenAI integration behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './update.js'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}))

const { createClient } = await import('@supabase/supabase-js')

describe('working-memory update endpoint', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let mockSupabase: any
  let mockSetHeader: ReturnType<typeof vi.fn>
  let mockEnd: ReturnType<typeof vi.fn>
  let responseBody: string

  beforeEach(() => {
    vi.clearAllMocks()
    responseBody = ''

    mockSetHeader = vi.fn()
    mockEnd = vi.fn((body?: string) => {
      if (body) responseBody = body
    })

    mockRes = {
      statusCode: 200,
      setHeader: mockSetHeader,
      end: mockEnd,
    }

    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      order: vi.fn(() => mockSupabase),
      maybeSingle: vi.fn(),
      upsert: vi.fn(() => mockSupabase),
    }

    ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSupabase)

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('CORS and OPTIONS handling', () => {
    it('handles OPTIONS request with CORS headers', async () => {
      mockReq = {
        method: 'OPTIONS',
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockSetHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
      expect(mockRes.statusCode).toBe(204)
      expect(mockEnd).toHaveBeenCalledWith()
    })

    it('rejects non-POST, non-OPTIONS methods', async () => {
      mockReq = {
        method: 'GET',
        [Symbol.asyncIterator]: async function* () {},
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(mockEnd).toHaveBeenCalledWith('Method Not Allowed')
    })
  })

  describe('request validation', () => {
    it('requires projectId and agent', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({}))
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('requires Supabase credentials', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Supabase credentials required')
    })

    it('requires OpenAI credentials', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI credentials required')
    })
  })

  describe('sequence-based update logic', () => {
    it('returns existing memory when no new messages', async () => {
      const existingMemory = {
        summary: 'Existing summary',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        open_questions: [],
        glossary: {},
        stakeholders: [],
        through_sequence: 5,
        last_updated_at: '2024-01-01T00:00:00Z',
      }

      const messages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
        { role: 'assistant', content: 'Response 1', sequence: 2 },
        { role: 'user', content: 'Message 2', sequence: 5 },
      ]

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: messages, error: null }),
      })

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { through_sequence: 5 } }),
      })

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: existingMemory }),
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(false)
      expect(response.workingMemory.summary).toBe('Existing summary')
      expect(response.workingMemory.throughSequence).toBe(5)
    })

    it('forces refresh when forceRefresh is true', async () => {
      const messages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
        { role: 'assistant', content: 'Response 1', sequence: 2 },
      ]

      const openaiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'New summary',
                goals: ['new goal'],
                requirements: [],
                constraints: [],
                decisions: [],
                assumptions: [],
                openQuestions: [],
                glossary: {},
                stakeholders: [],
              }),
            },
          },
        ],
      }

      // First call: fetchMessages
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: messages, error: null }),
      })

      // When forceRefresh is true, shouldUpdateMemory returns early without calling from()
      // So the next from() call is in saveWorkingMemory
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => openaiResponse,
      })

      // Second call: saveWorkingMemory upsert
      const upsertChain = {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      mockSupabase.from.mockReturnValueOnce(upsertChain)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
              forceRefresh: true,
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
      expect(response.workingMemory.summary).toBe('New summary')
    })
  })

  describe('OpenAI response parsing', () => {
    it('parses JSON from markdown code blocks', async () => {
      const messages = [{ role: 'user', content: 'Test', sequence: 1 }]

      const openaiResponse = {
        choices: [
          {
            message: {
              content: '```json\n{"summary": "Test", "goals": []}\n```',
            },
          },
        ],
      }

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: messages, error: null }),
      })

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => openaiResponse,
      })

      mockSupabase.from.mockReturnValueOnce({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test')
    })

    it('handles OpenAI API errors', async () => {
      const messages = [{ role: 'user', content: 'Test', sequence: 1 }]

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: messages, error: null }),
      })

      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      })

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI API error')
      expect(response.error).toContain('429')
    })
  })

  describe('error handling', () => {
    it('handles Supabase query errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to fetch conversation messages')
    })

    it('handles missing conversation messages', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              supabaseUrl: 'https://test.supabase.co',
              supabaseAnonKey: 'test-key',
              openaiApiKey: 'test-openai-key',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('No conversation messages found')
    })
  })
})

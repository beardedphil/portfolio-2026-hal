/**
 * Unit tests for working memory update endpoint.
 * Tests CORS handling, validation, OpenAI integration, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './update.js'
import { createClient } from '@supabase/supabase-js'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

describe('working-memory update handler', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number
  let responseHeaders: Record<string, string>

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup Supabase mock with proper chaining
    const createChain = () => ({
      select: vi.fn(() => createChain()),
      eq: vi.fn(() => createChain()),
      order: vi.fn(() => createChain()),
      maybeSingle: vi.fn(),
      upsert: vi.fn(),
    })

    mockSupabase = {
      from: vi.fn(() => createChain()),
    }

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    // Setup response mock
    responseBody = null
    responseStatus = 0
    responseHeaders = {}
    const statusCodeObj = { value: 0 }

    mockRes = {
      get statusCode() {
        return statusCodeObj.value
      },
      set statusCode(value: number) {
        statusCodeObj.value = value
        responseStatus = value
      },
      setHeader: vi.fn((name: string, value: string) => {
        responseHeaders[name] = value
      }),
      end: vi.fn((body: string) => {
        responseStatus = statusCodeObj.value
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    }

    // Mock global fetch for OpenAI API
    global.fetch = vi.fn() as any
  })

  describe('CORS handling', () => {
    it('handles OPTIONS request with CORS headers', async () => {
      mockReq = {
        method: 'OPTIONS',
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(204)
      expect(responseHeaders['Access-Control-Allow-Origin']).toBe('*')
      expect(responseHeaders['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
      expect(responseHeaders['Access-Control-Allow-Headers']).toBe('Content-Type')
    })

    it('sets CORS headers on POST requests', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({}))
        },
      }

      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn(() => messagesChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      mockSupabase.from.mockReturnValueOnce(messagesChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseHeaders['Access-Control-Allow-Origin']).toBe('*')
    })
  })

  describe('method validation', () => {
    it('rejects non-POST methods with 405', async () => {
      mockReq = {
        method: 'GET',
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(405)
      expect(responseBody).toBe('Method Not Allowed')
    })

    it('rejects PUT method with 405', async () => {
      mockReq = {
        method: 'PUT',
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(405)
    })
  })

  describe('request validation', () => {
    it('rejects request missing projectId and agent', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({}))
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('projectId and agent are required')
    })

    it('rejects request with empty projectId', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ projectId: '   ', agent: 'test-agent' }))
        },
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any).success).toBe(false)
    })

    it('rejects request missing Supabase credentials', async () => {
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

      expect(responseStatus).toBe(400)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('Supabase credentials required')
    })

    it('rejects request missing OpenAI credentials', async () => {
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

      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn(() => messagesChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from.mockReturnValueOnce(messagesChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('OpenAI credentials required')
    })
  })

  describe('OpenAI response parsing', () => {
    beforeEach(() => {
      // Setup valid request
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

      // Setup Supabase mocks for messages query (no maybeSingle, returns array directly)
      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn().mockResolvedValue({
          data: [
            { role: 'user', content: 'Test message', sequence: 1 },
            { role: 'assistant', content: 'Response', sequence: 2 },
          ],
          error: null,
        }),
      }

      // Setup Supabase mock for existing memory check
      const memoryCheckChain = {
        select: vi.fn(() => memoryCheckChain),
        eq: vi.fn(() => memoryCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      // Setup Supabase mock for upsert
      const upsertChain = {
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(messagesChain)
        .mockReturnValueOnce(memoryCheckChain)
        .mockReturnValueOnce(upsertChain)
    })

    it('parses plain JSON response from OpenAI', async () => {
      const workingMemoryJson = {
        summary: 'Test summary',
        goals: ['Goal 1'],
        requirements: ['Req 1'],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(workingMemoryJson) } }],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(true)
      expect((responseBody as any).workingMemory.summary).toBe('Test summary')
      expect((responseBody as any).workingMemory.goals).toEqual(['Goal 1'])
    })

    it('parses JSON from markdown code block', async () => {
      const workingMemoryJson = {
        summary: 'Test summary',
        goals: ['Goal 1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      const markdownResponse = `Here's the working memory:

\`\`\`json
${JSON.stringify(workingMemoryJson)}
\`\`\`

This is the extracted information.`

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: markdownResponse } }],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(true)
      expect((responseBody as any).workingMemory.summary).toBe('Test summary')
    })

    it('handles OpenAI API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('OpenAI API error')
    })

    it('handles empty OpenAI response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('empty response')
    })

    it('handles invalid JSON in OpenAI response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'This is not valid JSON { invalid' } }],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('Failed to parse')
    })
  })

  describe('error handling', () => {
    it('handles Supabase errors when fetching messages', async () => {
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

      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      }

      mockSupabase.from.mockReturnValueOnce(messagesChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('Failed to fetch conversation messages')
    })

    it('handles no messages found', async () => {
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

      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }

      mockSupabase.from.mockReturnValueOnce(messagesChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('No conversation messages found')
    })

    it('handles Supabase upsert errors', async () => {
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

      const messagesChain = {
        select: vi.fn(() => messagesChain),
        eq: vi.fn(() => messagesChain),
        order: vi.fn().mockResolvedValue({
          data: [{ role: 'user', content: 'Test', sequence: 1 }],
          error: null,
        }),
      }

      const memoryCheckChain = {
        select: vi.fn(() => memoryCheckChain),
        eq: vi.fn(() => memoryCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      const upsertChain = {
        upsert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Upsert failed' },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(messagesChain)
        .mockReturnValueOnce(memoryCheckChain)
        .mockReturnValueOnce(upsertChain)

      const workingMemoryJson = {
        summary: 'Test',
        goals: [],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(workingMemoryJson) } }],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect((responseBody as any).success).toBe(false)
      expect((responseBody as any).error).toContain('Failed to save working memory')
    })
  })
})

/**
 * Unit tests for working memory update handler.
 * Tests request validation, message fetching, OpenAI integration, and database operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Mock Supabase client at module level
const mockSupabaseClient = {
  from: vi.fn(),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock fetch for OpenAI API
const originalFetch = global.fetch
const mockFetch = vi.fn()

// Import handler after mocks are set up
import handler from './update.js'

// Mock Supabase query builder
// For queries that are awaited directly (like messages query)
const createMockQuery = (mockData: unknown, mockError: unknown = null) => {
  const result = { data: mockData, error: mockError }
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    // Make the query itself awaitable
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
      return Promise.resolve(result).then(resolve)
    },
    catch: (reject: (error: unknown) => unknown) => {
      return Promise.resolve(result).catch(reject)
    },
  }
  // Make all methods return the query object for chaining
  query.select.mockReturnValue(query as any)
  query.eq.mockReturnValue(query as any)
  query.order.mockReturnValue(query as any)
  return query as any
}

// Helper to create mock request
function createMockRequest(method: string, body?: unknown): IncomingMessage {
  return {
    method,
    [Symbol.asyncIterator]: async function* () {
      if (body) {
        yield Buffer.from(JSON.stringify(body))
      }
    },
  } as unknown as IncomingMessage
}

// Helper to create mock response
function createMockResponse(): ServerResponse {
  const headers: Record<string, string> = {}
  return {
    statusCode: 200,
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value
    }),
    end: vi.fn(),
  } as unknown as ServerResponse
}

// Helper to extract response data
function getResponseData(res: ServerResponse): { statusCode: number; body: unknown } {
  const endCalls = (res.end as ReturnType<typeof vi.fn>).mock.calls
  const lastCall = endCalls[endCalls.length - 1]
  const bodyStr = lastCall?.[0] || ''
  return {
    statusCode: res.statusCode,
    body: bodyStr ? JSON.parse(bodyStr as string) : null,
  }
}

describe('working-memory update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('CORS handling', () => {
    it('should handle OPTIONS request with CORS headers', async () => {
      const req = createMockRequest('OPTIONS')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
      expect(res.statusCode).toBe(204)
      expect(res.end).toHaveBeenCalledWith()
    })
  })

  describe('Method validation', () => {
    it('should reject non-POST methods', async () => {
      const req = createMockRequest('GET')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(405)
      expect(res.end).toHaveBeenCalledWith('Method Not Allowed')
    })

    it('should accept POST method', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      // Mock Supabase queries
      const messagesQuery = createMockQuery([
        { role: 'user', content: 'Hello', sequence: 1 },
      ])
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      // Mock OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  goals: ['Goal 1'],
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
        }),
      } as Response)

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const responseData = getResponseData(res)
      expect(responseData.body).toHaveProperty('success')
    })
  })

  describe('Request validation', () => {
    it('should require projectId and agent', async () => {
      const req = createMockRequest('POST', {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(400)
      expect(responseData.body).toEqual({
        success: false,
        error: 'projectId and agent are required.',
      })
    })

    it('should require Supabase credentials', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(400)
      expect(responseData.body).toEqual({
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    })

    it('should require OpenAI credentials', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(400)
      expect(responseData.body).toEqual({
        success: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
    })

    it('should use environment variables for Supabase credentials when not provided in body', async () => {
      const originalEnv = process.env
      process.env.SUPABASE_URL = 'https://env.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'env-key'

      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      // Mock Supabase queries
      const messagesQuery = createMockQuery([
        { role: 'user', content: 'Hello', sequence: 1 },
      ])
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      // Mock OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  goals: [],
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
        }),
      } as Response)

      await handler(req, res)

      process.env = originalEnv

      expect(res.statusCode).toBe(200)
      const responseData = getResponseData(res)
      expect(responseData.body).toHaveProperty('success')
    })
  })

  describe('Message fetching', () => {
    it('should handle Supabase error when fetching messages', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messagesQuery = createMockQuery(null, { message: 'Database error' })
      mockSupabaseClient.from = vi.fn(() => messagesQuery)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: false,
        error: 'Failed to fetch conversation messages: Database error',
      })
    })

    it('should handle empty messages array', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messagesQuery = createMockQuery([])
      mockSupabaseClient.from = vi.fn(() => messagesQuery)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: false,
        error: 'No conversation messages found.',
      })
    })

    it('should fetch messages ordered by sequence', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [
        { role: 'user', content: 'Hello', sequence: 1 },
        { role: 'assistant', content: 'Hi there', sequence: 2 },
      ]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      // Mock OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  goals: [],
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
        }),
      } as Response)

      await handler(req, res)

      expect(messagesQuery.select).toHaveBeenCalledWith('role, content, sequence')
      expect(messagesQuery.eq).toHaveBeenCalledWith('project_id', 'test-project')
      expect(messagesQuery.eq).toHaveBeenCalledWith('agent', 'test-agent')
      expect(messagesQuery.order).toHaveBeenCalledWith('sequence', { ascending: true })
    })
  })

  describe('Update check logic', () => {
    it('should return existing memory when no new messages and forceRefresh is false', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: false,
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const existingMemory = {
        summary: 'Existing summary',
        goals: ['Goal 1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        open_questions: [],
        glossary: {},
        stakeholders: [],
        through_sequence: 1,
        last_updated_at: '2024-01-01T00:00:00Z',
      }

      const messagesQuery = createMockQuery(messages)
      const memoryCheckQuery = createMockQuery({ through_sequence: 1 })
      const memoryFetchQuery = createMockQuery(existingMemory)

      let callCount = 0
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') {
          callCount++
          if (callCount === 1) return memoryCheckQuery
          return memoryFetchQuery
        }
        return createMockQuery(null)
      })

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: true,
        workingMemory: {
          summary: 'Existing summary',
          goals: ['Goal 1'],
          requirements: [],
          constraints: [],
          decisions: [],
          assumptions: [],
          openQuestions: [],
          glossary: {},
          stakeholders: [],
          lastUpdatedAt: '2024-01-01T00:00:00Z',
          throughSequence: 1,
        },
        updated: false,
      })
    })

    it('should force refresh when forceRefresh is true', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery({ through_sequence: 1 })
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      // Mock OpenAI response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'New summary',
                  goals: ['New goal'],
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
        }),
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toHaveProperty('success', true)
      expect(responseData.body).toHaveProperty('updated', true)
      expect(responseData.body.workingMemory.summary).toBe('New summary')
    })
  })

  describe('OpenAI integration', () => {
    it('should handle OpenAI API errors', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: false,
        error: 'OpenAI API error: 401 Unauthorized',
      })
    })

    it('should handle empty OpenAI response', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }],
        }),
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: false,
        error: 'OpenAI returned empty response',
      })
    })

    it('should parse JSON from markdown code blocks', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      const workingMemoryData = {
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '```json\n' + JSON.stringify(workingMemoryData) + '\n```',
              },
            },
          ],
        }),
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toHaveProperty('success', true)
      expect(responseData.body.workingMemory.summary).toBe('Test summary')
    })
  })

  describe('Database operations', () => {
    it('should handle upsert errors', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryCheckQuery = createMockQuery(null)
      const upsertQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: { message: 'Upsert failed' } }),
      }

      let callCount = 0
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') {
          callCount++
          if (callCount === 1) return memoryCheckQuery
          return upsertQuery
        }
        return createMockQuery(null)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  goals: [],
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
        }),
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toEqual({
        success: false,
        error: 'Failed to save working memory: Upsert failed',
      })
    })

    it('should upsert working memory with correct structure', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 5 }]
      const messagesQuery = createMockQuery(messages)
      const memoryCheckQuery = createMockQuery(null)
      const upsertQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }

      let callCount = 0
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') {
          callCount++
          if (callCount === 1) return memoryCheckQuery
          return upsertQuery
        }
        return createMockQuery(null)
      })

      const workingMemoryData = {
        summary: 'Test summary',
        goals: ['Goal 1', 'Goal 2'],
        requirements: ['Req 1'],
        constraints: ['Constraint 1'],
        decisions: ['Decision 1'],
        assumptions: ['Assumption 1'],
        openQuestions: ['Question 1'],
        glossary: { term1: 'definition1' },
        stakeholders: ['Stakeholder 1'],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(workingMemoryData),
              },
            },
          ],
        }),
      } as Response)

      await handler(req, res)

      expect(upsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'test-project',
          agent: 'test-agent',
          summary: 'Test summary',
          goals: ['Goal 1', 'Goal 2'],
          requirements: ['Req 1'],
          constraints: ['Constraint 1'],
          decisions: ['Decision 1'],
          assumptions: ['Assumption 1'],
          open_questions: ['Question 1'],
          glossary: { term1: 'definition1' },
          stakeholders: ['Stakeholder 1'],
          through_sequence: 5,
        }),
        { onConflict: 'project_id,agent' }
      )

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toHaveProperty('success', true)
      expect(responseData.body).toHaveProperty('updated', true)
    })
  })

  describe('Error handling', () => {
    it('should handle JSON parse errors', async () => {
      const req = createMockRequest('POST', {
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      const messages = [{ role: 'user', content: 'Hello', sequence: 1 }]
      const messagesQuery = createMockQuery(messages)
      const memoryQuery = createMockQuery(null)
      mockSupabaseClient.from = vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return messagesQuery
        if (table === 'hal_conversation_working_memory') return memoryQuery
        return createMockQuery(null)
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Invalid JSON {',
              },
            },
          ],
        }),
      } as Response)

      await handler(req, res)

      const responseData = getResponseData(res)
      expect(res.statusCode).toBe(200)
      expect(responseData.body).toHaveProperty('success', false)
      expect(responseData.body.error).toContain('Failed to parse working memory')
    })

    it('should handle general errors with 500 status', async () => {
      const req = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          throw new Error('Stream error')
        },
      } as unknown as IncomingMessage
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(500)
      const responseData = getResponseData(res)
      expect(responseData.body).toHaveProperty('success', false)
      expect(responseData.body.error).toBe('Stream error')
    })
  })
})

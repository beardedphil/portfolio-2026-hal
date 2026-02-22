/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, update logic, OpenAI integration, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './update.js'

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
}

// Track query chains for different tables
const queryChains: Record<string, any> = {}

// Store chains by table name - each table gets its own chain
const tableChains: Record<string, any> = {}

const mockFrom = (table: string) => {
  // Create or get existing chain for this table
  if (!tableChains[table]) {
    let orderPromise: Promise<any> | null = null
    let maybeSinglePromise: Promise<any> | null = null
    let upsertPromise: Promise<any> | null = null
    
    tableChains[table] = {
      select: vi.fn(function() { return this }),
      eq: vi.fn(function() { return this }),
      order: vi.fn(function(...args: any[]) {
        // Always return the promise (order is always the final method for messages query)
        return orderPromise !== null ? orderPromise : Promise.resolve({ data: [], error: null })
      }),
      maybeSingle: vi.fn(function() {
        return maybeSinglePromise !== null ? maybeSinglePromise : Promise.resolve({ data: null, error: null })
      }),
      upsert: vi.fn(function(...args: any[]) {
        return upsertPromise !== null ? upsertPromise : Promise.resolve({ error: null })
      }),
      // Helper to set the promise for order()
      _setOrderPromise: (promise: Promise<any>) => { orderPromise = promise },
      // Helper to set the promise for maybeSingle()
      _setMaybeSinglePromise: (promise: Promise<any>) => { maybeSinglePromise = promise },
      // Helper to set the promise for upsert()
      _setUpsertPromise: (promise: Promise<any>) => { upsertPromise = promise },
    }
  }
  
  // Make from() return the chain for this table
  mockSupabaseClient.from.mockImplementation((tableName: string) => {
    if (tableName === table) {
      return tableChains[table]
    }
    // Return a default chain for other tables
    if (!tableChains[tableName]) {
      tableChains[tableName] = {
        select: vi.fn(function() { return this }),
        eq: vi.fn(function() { return this }),
        order: vi.fn(function() { return Promise.resolve({ data: [], error: null }) }),
        maybeSingle: vi.fn(function() { return Promise.resolve({ data: null, error: null }) }),
        upsert: vi.fn(function() { return Promise.resolve({ error: null }) }),
        _setOrderPromise: () => {},
        _setMaybeSinglePromise: () => {},
        _setUpsertPromise: () => {},
      }
    }
    return tableChains[tableName]
  })
  
  return tableChains[table]
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock fetch for OpenAI API
const originalFetch = global.fetch
const mockFetch = vi.fn()

// Helper to create mock request
function createMockRequest(body: unknown, method = 'POST'): IncomingMessage {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    method,
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(bodyStr)
    },
  } as unknown as IncomingMessage
}

// Helper to create mock response
function createMockResponse(): ServerResponse {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let responseBody = ''

  return {
    statusCode,
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value
    }),
    end: vi.fn((body?: string) => {
      if (body !== undefined) {
        responseBody = body
      }
    }),
    get status() {
      return statusCode
    },
    set status(code: number) {
      statusCode = code
    },
    get responseBody() {
      return responseBody
    },
  } as unknown as ServerResponse
}

describe('working memory update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-anon-key'
    // Reset query chains and table chains
    Object.keys(queryChains).forEach(key => delete queryChains[key])
    Object.keys(tableChains).forEach(key => delete tableChains[key])
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_URL
    delete process.env.VITE_SUPABASE_ANON_KEY
  })

  describe('CORS and method validation', () => {
    it('should handle OPTIONS request with CORS headers', async () => {
      const req = createMockRequest({}, 'OPTIONS')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
      expect(res.statusCode).toBe(204)
    })

    it('should reject non-POST methods', async () => {
      const req = createMockRequest({}, 'GET')
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(405)
      expect(res.responseBody).toBe('Method Not Allowed')
    })
  })

  describe('request validation', () => {
    it('should require projectId and agent', async () => {
      const req = createMockRequest({})
      const res = createMockResponse()

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(res.statusCode).toBe(400)
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('should require Supabase credentials', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_ANON_KEY

      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
      })
      const res = createMockResponse()

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(res.statusCode).toBe(400)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Supabase credentials required')
    })

    it('should require OpenAI credentials', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(res.statusCode).toBe(400)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI credentials required')
    })

    it('should accept credentials from environment variables', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [
          { role: 'user', content: 'Test message', sequence: 1 },
        ],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI response
      mockFetch.mockResolvedValue({
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
      })

      // Mock upsert
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: null,
      }))

      await handler(req, res)

      // Should not fail on credentials validation
      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      if (response.error) {
        expect(response.error).not.toContain('Supabase credentials required')
      }
    })
  })

  describe('update logic - returning existing memory', () => {
    it('should return existing memory when no new messages and forceRefresh is false', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: false,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [
          { role: 'user', content: 'Test message', sequence: 1 },
        ],
        error: null,
      }))

      // Mock existing memory query (checking through_sequence) - first call
      const memoryCheckChain = mockFrom('hal_conversation_working_memory')
      memoryCheckChain._setMaybeSinglePromise(Promise.resolve({
        data: { through_sequence: 1 },
        error: null,
      }))
      
      // Mock existing memory query - second call (fetch full memory)
      const existingMemoryChain = mockFrom('hal_conversation_working_memory')
      existingMemoryChain._setMaybeSinglePromise(Promise.resolve({
        data: {
          summary: 'Existing summary',
          goals: ['goal1'],
          requirements: [],
          constraints: [],
          decisions: [],
          assumptions: [],
          open_questions: [],
          glossary: {},
          stakeholders: [],
          last_updated_at: '2024-01-01T00:00:00Z',
          through_sequence: 1,
        },
        error: null,
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(false)
      expect(response.workingMemory.summary).toBe('Existing summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
      expect(mockFetch).not.toHaveBeenCalled() // Should not call OpenAI
    })

    it('should update when forceRefresh is true', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [
          { role: 'user', content: 'Test message', sequence: 1 },
        ],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: { through_sequence: 1 },
        error: null,
      }))

      // Mock OpenAI response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Updated summary',
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
        }),
      })

      // Mock upsert
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: null,
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
      expect(response.workingMemory.summary).toBe('Updated summary')
      expect(mockFetch).toHaveBeenCalled() // Should call OpenAI
    })

    it('should update when new messages exist', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: false,
      })
      const res = createMockResponse()

      // Mock messages query with new message (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [
          { role: 'user', content: 'Test message', sequence: 1 },
          { role: 'assistant', content: 'Response', sequence: 2 },
        ],
        error: null,
      }))

      // Mock existing memory query (through_sequence is 1, but current is 2)
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: { through_sequence: 1 },
        error: null,
      }))

      // Mock OpenAI response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'New summary',
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
      })

      // Mock upsert
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: null,
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
      expect(mockFetch).toHaveBeenCalled() // Should call OpenAI
    })
  })

  describe('OpenAI response parsing', () => {
    it('should parse JSON response without markdown code blocks', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI response with plain JSON
      const workingMemory = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(workingMemory),
              },
            },
          ],
        }),
      })

      // Mock upsert
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: null,
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
    })

    it('should parse JSON response with markdown code blocks', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI response with markdown code block
      const workingMemory = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${JSON.stringify(workingMemory)}\n\`\`\``,
              },
            },
          ],
        }),
      })

      // Mock upsert
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: null,
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
    })
  })

  describe('error handling', () => {
    it('should handle Supabase errors when fetching messages', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
      })
      const res = createMockResponse()

      // Mock messages query error (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: null,
        error: { message: 'Database error' },
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to fetch conversation messages')
    })

    it('should handle OpenAI API errors', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI error response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI API error')
    })

    it('should handle empty OpenAI response', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI empty response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{}],
        }),
      })

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI returned empty response')
    })

    it('should handle JSON parse errors', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI response with invalid JSON
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'invalid json {',
              },
            },
          ],
        }),
      })

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to parse working memory')
    })

    it('should handle Supabase upsert errors', async () => {
      const req = createMockRequest({
        projectId: 'test-project',
        agent: 'test-agent',
        openaiApiKey: 'test-openai-key',
        openaiModel: 'gpt-4',
        forceRefresh: true,
      })
      const res = createMockResponse()

      // Mock messages query (doesn't use maybeSingle, returns data directly)
      const messagesChain = mockFrom('hal_conversation_messages')
      messagesChain._setOrderPromise(Promise.resolve({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      }))

      // Mock existing memory query
      const memoryChain = mockFrom('hal_conversation_working_memory')
      memoryChain._setMaybeSinglePromise(Promise.resolve({
        data: null,
        error: null,
      }))

      // Mock OpenAI response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test',
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
      })

      // Mock upsert error
      const upsertChain = mockFrom('hal_conversation_working_memory')
      upsertChain._setUpsertPromise(Promise.resolve({
        error: { message: 'Upsert failed' },
      }))

      await handler(req, res)

      const response = JSON.parse(res.responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to save working memory')
    })
  })
})

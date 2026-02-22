/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, message fetching, sequence checking, OpenAI integration, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock global fetch for OpenAI API calls
global.fetch = vi.fn()

describe('update.ts', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseData: { statusCode?: number; headers?: Record<string, string>; body?: string }
  let mockSupabaseClient: any
  let mockMessagesQuery: any
  let mockMemoryQuery: any

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks()

    // Setup mock response
    responseData = {}
    mockRes = {
      statusCode: 200,
      setHeader: vi.fn((name: string, value: string) => {
        if (!responseData.headers) responseData.headers = {}
        responseData.headers[name] = value
      }),
      end: vi.fn((body?: string) => {
        responseData.body = body
      }),
    }

    // Setup mock Supabase client
    mockMessagesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { role: 'user', content: 'Test message 1', sequence: 1 },
          { role: 'assistant', content: 'Test response 1', sequence: 2 },
        ],
        error: null,
      }),
    }

    mockMemoryQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === 'hal_conversation_messages') return mockMessagesQuery
        if (table === 'hal_conversation_working_memory') return mockMemoryQuery
        return { select: vi.fn(), eq: vi.fn() }
      }),
    }

    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CORS headers', () => {
    it('sets CORS headers for all requests', async () => {
      mockReq = {
        method: 'OPTIONS',
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
    })

    it('handles OPTIONS request with 204 status', async () => {
      mockReq = {
        method: 'OPTIONS',
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalledWith()
    })
  })

  describe('method validation', () => {
    it('rejects non-POST methods with 405', async () => {
      mockReq = {
        method: 'GET',
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(mockRes.end).toHaveBeenCalledWith('Method Not Allowed')
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

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseData.body).toBeTruthy()
      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('validates projectId is not empty after trimming', async () => {
      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ projectId: '   ', agent: 'test-agent' }))
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('requires Supabase credentials from body or environment', async () => {
      const originalEnv = process.env.SUPABASE_URL
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ projectId: 'test-project', agent: 'test-agent' }))
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('Supabase credentials required')

      if (originalEnv) process.env.SUPABASE_URL = originalEnv
    })

    it('requires OpenAI credentials', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ projectId: 'test-project', agent: 'test-agent' }))
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI credentials required')
    })
  })

  describe('message fetching', () => {
    it('fetches messages with correct filters and ordering', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('hal_conversation_messages')
      expect(mockMessagesQuery.select).toHaveBeenCalledWith('role, content, sequence')
      expect(mockMessagesQuery.eq).toHaveBeenCalledWith('project_id', 'test-project')
      expect(mockMessagesQuery.eq).toHaveBeenCalledWith('agent', 'test-agent')
      expect(mockMessagesQuery.order).toHaveBeenCalledWith('sequence', { ascending: true })
    })

    it('handles message fetch errors', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockMessagesQuery.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to fetch conversation messages')
    })

    it('handles empty message list', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockMessagesQuery.order.mockResolvedValue({
        data: [],
        error: null,
      })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('No conversation messages found')
    })
  })

  describe('sequence checking and update logic', () => {
    it('returns existing memory when no new messages (currentSequence <= lastProcessedSequence)', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      // Messages with sequence 2
      mockMessagesQuery.order.mockResolvedValue({
        data: [
          { role: 'user', content: 'Test', sequence: 1 },
          { role: 'assistant', content: 'Response', sequence: 2 },
        ],
        error: null,
      })

      // Existing memory with through_sequence = 2
      mockMemoryQuery.maybeSingle
        .mockResolvedValueOnce({
          data: { through_sequence: 2 },
          error: null,
        })
        .mockResolvedValueOnce({
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
            through_sequence: 2,
          },
          error: null,
        })

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(true)
      expect(response.updated).toBe(false)
      expect(response.workingMemory.summary).toBe('Existing summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
    })

    it('forces refresh when forceRefresh is true', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockMessagesQuery.order.mockResolvedValue({
        data: [
          { role: 'user', content: 'Test', sequence: 1 },
          { role: 'assistant', content: 'Response', sequence: 2 },
        ],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: { through_sequence: 2 },
        error: null,
      })

      // Mock OpenAI response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      } as any)

      // Mock upsert
      const mockUpsert = {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      mockMemoryQuery.upsert = mockUpsert.upsert
      mockSupabaseClient.from.mockReturnValueOnce(mockMessagesQuery).mockReturnValueOnce(mockMemoryQuery).mockReturnValueOnce(mockUpsert)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
              forceRefresh: true,
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
      expect(response.workingMemory.summary).toBe('New summary')
    })
  })

  describe('OpenAI integration', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'
    })

    it('calls OpenAI API with correct prompt and parameters', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [
          { role: 'user', content: 'Test message', sequence: 1 },
        ],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const mockOpenAIResponse = {
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
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpenAIResponse,
      } as any)

      const mockUpsert = {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      mockSupabaseClient.from
        .mockReturnValueOnce(mockMessagesQuery)
        .mockReturnValueOnce(mockMemoryQuery)
        .mockReturnValueOnce(mockUpsert)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test',
        },
        body: expect.stringContaining('"model":"gpt-4"'),
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.model).toBe('gpt-4')
      expect(body.temperature).toBe(0.3)
      expect(body.max_tokens).toBe(2000)
      expect(body.messages[0].content).toContain('Test message')
    })

    it('parses JSON from OpenAI response with markdown code blocks', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const jsonContent = JSON.stringify({
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${jsonContent}\n\`\`\``,
              },
            },
          ],
        }),
      } as any)

      const mockUpsert = {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      mockSupabaseClient.from
        .mockReturnValueOnce(mockMessagesQuery)
        .mockReturnValueOnce(mockMemoryQuery)
        .mockReturnValueOnce(mockUpsert)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
    })

    it('handles OpenAI API errors', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as any)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI API error')
    })

    it('handles empty OpenAI response', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }],
        }),
      } as any)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI returned empty response')
    })
  })

  describe('working memory upsert', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'
    })

    it('upserts working memory with correct structure and through_sequence', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [
          { role: 'user', content: 'Test', sequence: 1 },
          { role: 'assistant', content: 'Response', sequence: 2 },
        ],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const workingMemoryData = {
        summary: 'Test summary',
        goals: ['goal1', 'goal2'],
        requirements: ['req1'],
        constraints: ['constraint1'],
        decisions: ['decision1'],
        assumptions: ['assumption1'],
        openQuestions: ['question1'],
        glossary: { term1: 'definition1' },
        stakeholders: ['stakeholder1'],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
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
      } as any)

      const mockUpsert = {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      mockSupabaseClient.from
        .mockReturnValueOnce(mockMessagesQuery)
        .mockReturnValueOnce(mockMemoryQuery)
        .mockReturnValueOnce(mockUpsert)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'test-project',
          agent: 'test-agent',
          summary: 'Test summary',
          goals: ['goal1', 'goal2'],
          requirements: ['req1'],
          constraints: ['constraint1'],
          decisions: ['decision1'],
          assumptions: ['assumption1'],
          open_questions: ['question1'],
          glossary: { term1: 'definition1' },
          stakeholders: ['stakeholder1'],
          through_sequence: 2,
        }),
        { onConflict: 'project_id,agent' }
      )

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
      expect(response.workingMemory.throughSequence).toBe(2)
    })

    it('handles upsert errors', async () => {
      mockMessagesQuery.order.mockResolvedValue({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
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
      } as any)

      const mockUpsert = {
        upsert: vi.fn().mockResolvedValue({ error: { message: 'Database error' } }),
      }
      mockSupabaseClient.from
        .mockReturnValueOnce(mockMessagesQuery)
        .mockReturnValueOnce(mockMemoryQuery)
        .mockReturnValueOnce(mockUpsert)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to save working memory')
    })
  })

  describe('error handling', () => {
    it('handles JSON parse errors gracefully', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('invalid json')
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(500)
      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
    })

    it('handles OpenAI response parse errors', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'test-key'

      mockMessagesQuery.order.mockResolvedValue({
        data: [{ role: 'user', content: 'Test', sequence: 1 }],
        error: null,
      })

      mockMemoryQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'invalid json response',
              },
            },
          ],
        }),
      } as any)

      mockReq = {
        method: 'POST',
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(
            JSON.stringify({
              projectId: 'test-project',
              agent: 'test-agent',
              openaiApiKey: 'sk-test',
              openaiModel: 'gpt-4',
            })
          )
        },
      }

      const handler = (await import('./update.js')).default
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const response = JSON.parse(responseData.body || '{}')
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to parse working memory')
    })
  })
})

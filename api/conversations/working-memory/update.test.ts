/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, Supabase interactions, OpenAI API calls, and response handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import handler from './update.js'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock fetch globally
global.fetch = vi.fn()

describe('working-memory/update.ts', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let mockSupabaseClient: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock request
    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({}))
      },
    }

    // Mock response
    let statusCode = 200
    let headers: Record<string, string> = {}
    let responseBody: any = null

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value
      }),
      end: vi.fn((body?: string) => {
        responseBody = body
      }),
      get statusCode() {
        return statusCode
      },
      set statusCode(code: number) {
        statusCode = code
      },
    }

    // Mock Supabase client - query builder pattern with result queue
    const queryResults: Array<{ data: any; error: any }> = []
    const upsertResults: Array<{ error: any }> = []

    const createQueryBuilder = () => {
      const builder: any = {}
      let queryPromise: Promise<{ data: any; error: any }> | null = null
      
      builder.from = vi.fn(() => builder)
      builder.select = vi.fn(() => {
        queryPromise = Promise.resolve(queryResults.shift() || { data: null, error: null })
        return builder
      })
      builder.eq = vi.fn(() => builder)
      builder.order = vi.fn(() => {
        // order() is the final method in the chain, return the promise
        return queryPromise || Promise.resolve(queryResults.shift() || { data: null, error: null })
      })
      builder.maybeSingle = vi.fn(() => {
        // maybeSingle() is the final method, return promise
        return Promise.resolve(queryResults.shift() || { data: null, error: null })
      })
      builder.upsert = vi.fn(() => {
        return Promise.resolve(upsertResults.shift() || { error: null })
      })
      return builder
    }

    mockSupabaseClient = {
      from: vi.fn(() => createQueryBuilder()),
    }

    // Helper methods for tests
    ;(mockSupabaseClient as any).addQueryResult = (result: { data: any; error: any }) => {
      queryResults.push(result)
    }
    ;(mockSupabaseClient as any).addUpsertResult = (result: { error: any }) => {
      upsertResults.push(result)
    }
    ;(mockSupabaseClient as any).clearResults = () => {
      queryResults.length = 0
      upsertResults.length = 0
    }

    vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CORS handling', () => {
    it('handles OPTIONS request with CORS headers', async () => {
      mockReq.method = 'OPTIONS'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('sets CORS headers for POST requests', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { through_sequence: 0 },
        error: null,
      })
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
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
                  summary: 'test',
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

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    })
  })

  describe('Method validation', () => {
    it('rejects non-POST, non-OPTIONS methods', async () => {
      mockReq.method = 'GET'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(mockRes.end).toHaveBeenCalledWith('Method Not Allowed')
    })
  })

  describe('Request body validation', () => {
    it('requires projectId and agent', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key',
          })
        )
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('requires Supabase credentials', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
          })
        )
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Supabase credentials required')
    })

    it('accepts Supabase credentials from environment variables', async () => {
      const originalEnv = process.env
      process.env.SUPABASE_URL = 'https://env.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'env-key'

      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
            openaiApiKey: 'test-openai-key',
            openaiModel: 'gpt-4',
          })
        )
      }

      // Mock Supabase responses
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { through_sequence: 0 },
        error: null,
      })
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
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
                  summary: 'test',
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

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(createClient).toHaveBeenCalledWith('https://env.supabase.co', 'env-key')

      process.env = originalEnv
    })

    it('requires OpenAI credentials', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key',
          })
        )
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI credentials required')
    })
  })

  describe('Conversation message fetching', () => {
    it('handles Supabase error when fetching messages', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      ;(mockSupabaseClient as any).addQueryResult({
        data: null,
        error: { message: 'Database error' },
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to fetch conversation messages')
    })

    it('handles empty conversation messages', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      ;(mockSupabaseClient as any).addQueryResult({
        data: [],
        error: null,
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('No conversation messages found')
    })
  })

  describe('Update decision logic', () => {
    it('returns existing memory when no new messages and forceRefresh is false', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key',
            openaiApiKey: 'test-openai-key',
            openaiModel: 'gpt-4',
            forceRefresh: false,
          })
        )
      }

      // Mock Supabase responses - order: messages query, existing memory check, existing memory fetch
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 5 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 5 },
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: {
          summary: 'existing summary',
          goals: ['goal1'],
          requirements: [],
          constraints: [],
          decisions: [],
          assumptions: [],
          open_questions: [],
          glossary: {},
          stakeholders: [],
          last_updated_at: '2024-01-01T00:00:00Z',
          through_sequence: 5,
        },
        error: null,
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(false)
      expect(response.workingMemory.summary).toBe('existing summary')
      expect(response.workingMemory.goals).toEqual(['goal1'])
      // OpenAI should not be called
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('forces refresh when forceRefresh is true', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 5 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 5 },
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
                  summary: 'new summary',
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

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(global.fetch).toHaveBeenCalled()
      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(true)
      expect(response.updated).toBe(true)
    })
  })

  describe('OpenAI API integration', () => {
    it('calls OpenAI API with correct parameters', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock messages query
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [
          { role: 'user', content: 'Hello', sequence: 1 },
          { role: 'assistant', content: 'Hi there', sequence: 2 },
        ],
        error: null,
      })

      // Mock existing memory check
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { through_sequence: 0 },
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
                  summary: 'test summary',
                  goals: ['goal1', 'goal2'],
                  requirements: ['req1'],
                  constraints: [],
                  decisions: [],
                  assumptions: [],
                  openQuestions: [],
                  glossary: { term: 'definition' },
                  stakeholders: [],
                }),
              },
            },
          ],
        }),
      } as any)

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-openai-key',
        },
        body: expect.stringContaining('"model":"gpt-4"'),
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.model).toBe('gpt-4')
      expect(body.temperature).toBe(0.3)
      expect(body.max_tokens).toBe(2000)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toContain('**user**: Hello')
      expect(body.messages[0].content).toContain('**assistant**: Hi there')
    })

    it('handles OpenAI API errors', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 0 },
        error: null,
      })

      // Mock OpenAI error response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as any)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI API error')
    })

    it('handles empty OpenAI response', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 0 },
        error: null,
      })

      // Mock OpenAI empty response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: {} }],
        }),
      } as any)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI returned empty response')
    })

    it('parses JSON from markdown code blocks', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 0 },
        error: null,
      })

      // Mock OpenAI response with markdown code block
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '```json\n{"summary": "test", "goals": [], "requirements": [], "constraints": [], "decisions": [], "assumptions": [], "openQuestions": [], "glossary": {}, "stakeholders": []}\n```',
              },
            },
          ],
        }),
      } as any)

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('test')
    })
  })

  describe('Working memory persistence', () => {
    it('saves working memory to Supabase with correct structure', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock messages query
      mockSupabaseClient.select.mockResolvedValueOnce({
        data: [{ role: 'user', content: 'test', sequence: 10 }],
        error: null,
      })

      // Mock existing memory check
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: { through_sequence: 0 },
        error: null,
      })

      const workingMemoryData = {
        summary: 'test summary',
        goals: ['goal1', 'goal2'],
        requirements: ['req1'],
        constraints: ['constraint1'],
        decisions: ['decision1'],
        assumptions: ['assumption1'],
        openQuestions: ['question1'],
        glossary: { term1: 'definition1', term2: 'definition2' },
        stakeholders: ['stakeholder1'],
      }

      // Mock OpenAI response
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

      ;(mockSupabaseClient as any).addUpsertResult({ error: null })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          project_id: 'test-project',
          agent: 'test-agent',
          summary: 'test summary',
          goals: ['goal1', 'goal2'],
          requirements: ['req1'],
          constraints: ['constraint1'],
          decisions: ['decision1'],
          assumptions: ['assumption1'],
          open_questions: ['question1'],
          glossary: { term1: 'definition1', term2: 'definition2' },
          stakeholders: ['stakeholder1'],
          through_sequence: 10,
          last_updated_at: expect.any(String),
        },
        { onConflict: 'project_id,agent' }
      )
    })

    it('handles Supabase upsert errors', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 0 },
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
                  summary: 'test',
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

      mockSupabaseClient.upsert.mockResolvedValueOnce({
        error: { message: 'Database constraint violation' },
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to save working memory')
    })
  })

  describe('Error handling', () => {
    it('handles JSON parse errors gracefully', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('invalid json{')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(500)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toBeDefined()
    })

    it('handles OpenAI JSON parse errors', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
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
      }

      // Mock Supabase responses - order: messages query, existing memory check
      ;(mockSupabaseClient as any).addQueryResult({
        data: [{ role: 'user', content: 'test', sequence: 1 }],
        error: null,
      })
      ;(mockSupabaseClient as any).addQueryResult({
        data: { through_sequence: 0 },
        error: null,
      })

      // Mock OpenAI response with invalid JSON
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'not valid json',
              },
            },
          ],
        }),
      } as any)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(mockRes.end.mock.calls[0][0] as string)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Failed to parse working memory')
    })
  })
})

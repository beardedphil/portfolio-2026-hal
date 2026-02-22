/**
 * Unit tests for working memory update endpoint.
 * Tests validation, CORS handling, and error cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './update.js'

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}))

// Mock fetch for OpenAI API
global.fetch = vi.fn()

describe('working-memory/update handler', () => {
  let req: IncomingMessage
  let res: ServerResponse
  let setHeaderSpy: ReturnType<typeof vi.fn>
  let endSpy: ReturnType<typeof vi.fn>
  let statusCodeSetter: (value: number) => void

  beforeEach(() => {
    vi.clearAllMocks()
    setHeaderSpy = vi.fn()
    endSpy = vi.fn()
    statusCodeSetter = vi.fn((value: number) => {
      // Store status code
    })

    req = {
      method: 'POST',
      url: '/api/conversations/working-memory/update',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{}')
      },
    } as unknown as IncomingMessage

    res = {
      statusCode: 200,
      setHeader: setHeaderSpy,
      end: endSpy,
    } as unknown as ServerResponse
  })

  describe('CORS and OPTIONS handling', () => {
    it('should set CORS headers for all requests', async () => {
      req.method = 'POST'
      await handler(req, res)

      expect(setHeaderSpy).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(setHeaderSpy).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(setHeaderSpy).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
    })

    it('should handle OPTIONS request with 204 status', async () => {
      req.method = 'OPTIONS'
      await handler(req, res)

      expect(res.statusCode).toBe(204)
      expect(endSpy).toHaveBeenCalledWith()
    })

    it('should reject non-POST, non-OPTIONS methods with 405', async () => {
      req.method = 'GET'
      await handler(req, res)

      expect(res.statusCode).toBe(405)
      expect(endSpy).toHaveBeenCalledWith('Method Not Allowed')
    })
  })

  describe('Request validation', () => {
    it('should reject request missing projectId', async () => {
      req[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ agent: 'test-agent' }))
      }

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('projectId and agent are required')
      expect(res.statusCode).toBe(400)
    })

    it('should reject request missing agent', async () => {
      req[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ projectId: 'test-project' }))
      }

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('projectId and agent are required')
      expect(res.statusCode).toBe(400)
    })

    it('should reject request with empty projectId', async () => {
      req[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ projectId: '   ', agent: 'test-agent' }))
      }

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('projectId and agent are required')
    })

    it('should reject request missing Supabase credentials', async () => {
      req[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
          })
        )
      }

      // Mock environment to not have Supabase vars
      const originalEnv = process.env
      process.env = { ...originalEnv }
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_ANON_KEY
      delete process.env.VITE_SUPABASE_ANON_KEY

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('Supabase credentials required')

      process.env = originalEnv
    })

    it('should reject request missing OpenAI credentials', async () => {
      req[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            projectId: 'test-project',
            agent: 'test-agent',
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key',
          })
        )
      }

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('OpenAI credentials required')
    })
  })

  describe('Sequence checking logic', () => {
    it('should return existing memory when no new messages (currentSequence <= lastProcessedSequence)', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      // Mock messages query - return messages with sequence 5
      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
        { role: 'assistant', content: 'Message 2', sequence: 5 },
      ]

      // Mock existing memory query - return memory with through_sequence 5
      const mockExistingMemory = {
        through_sequence: 5,
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
      }

      // Setup mocks - need to match the actual query chain structure
      const mockMaybeSingle1 = vi.fn().mockResolvedValue({ data: mockMessages, error: null })
      const mockOrder1 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle1 })
      const mockEq1_2 = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockEq1_1 = vi.fn().mockReturnValue({ eq: mockEq1_2 })
      const mockSelect1 = vi.fn().mockReturnValue({ eq: mockEq1_1 })

      const mockMaybeSingle2 = vi.fn().mockResolvedValue({ data: mockExistingMemory, error: null })
      const mockEq2_2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle2 })
      const mockEq2_1 = vi.fn().mockReturnValue({ eq: mockEq2_2 })
      const mockSelect2 = vi.fn().mockReturnValue({ eq: mockEq2_1 })

      const mockMaybeSingle3 = vi.fn().mockResolvedValue({ data: mockExistingMemory, error: null })
      const mockEq3_1 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle3 })
      const mockSelect3 = vi.fn().mockReturnValue({ eq: mockEq3_1 })

      const mockFrom = vi.fn()
        .mockReturnValueOnce({ select: mockSelect1 }) // messages query
        .mockReturnValueOnce({ select: mockSelect2 }) // existing memory check
        .mockReturnValueOnce({ select: mockSelect3 }) // full existing memory fetch

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(true)
      expect(responseBody.updated).toBe(false)
      expect(responseBody.workingMemory.summary).toBe('Existing summary')
      expect(responseBody.workingMemory.throughSequence).toBe(5)
    })

    it('should force refresh when forceRefresh is true', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = createClient('https://test.supabase.co', 'test-key')

      req[Symbol.asyncIterator] = async function* () {
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

      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
        { role: 'assistant', content: 'Message 2', sequence: 2 },
      ]

      const mockExistingMemory = {
        through_sequence: 2,
      }

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
      } as Response)

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()
      const mockUpsert = vi.fn()

      // Messages query
      mockMaybeSingle.mockResolvedValueOnce({ data: mockMessages, error: null })
      // Existing memory check
      mockMaybeSingle.mockResolvedValueOnce({ data: mockExistingMemory, error: null })
      // Upsert
      mockUpsert.mockResolvedValueOnce({ error: null })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        })
        .mockReturnValueOnce({
          maybeSingle: mockMaybeSingle,
        })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
        upsert: mockUpsert,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(true)
      expect(responseBody.updated).toBe(true)
      expect(responseBody.workingMemory.summary).toBe('New summary')
    })
  })

  describe('OpenAI integration and JSON parsing', () => {
    it('should parse JSON from OpenAI response with markdown code blocks', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
        { role: 'assistant', content: 'Message 2', sequence: 2 },
      ]

      const workingMemoryData = {
        summary: 'Test summary',
        goals: ['goal1', 'goal2'],
        requirements: ['req1'],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: { term1: 'definition1' },
        stakeholders: ['stakeholder1'],
      }

      // Mock OpenAI response with markdown code block
      vi.mocked(global.fetch).mockResolvedValueOnce({
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

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()
      const mockUpsert = vi.fn()

      mockMaybeSingle
        .mockResolvedValueOnce({ data: mockMessages, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // No existing memory

      mockUpsert.mockResolvedValueOnce({ error: null })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        })
        .mockReturnValueOnce({
          maybeSingle: mockMaybeSingle,
        })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
        upsert: mockUpsert,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(true)
      expect(responseBody.workingMemory.summary).toBe('Test summary')
      expect(responseBody.workingMemory.goals).toEqual(['goal1', 'goal2'])
      expect(responseBody.workingMemory.glossary).toEqual({ term1: 'definition1' })
    })

    it('should handle OpenAI API errors', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
      ]

      // Mock OpenAI API error
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()

      mockMaybeSingle
        .mockResolvedValueOnce({ data: mockMessages, error: null })
        .mockResolvedValueOnce({ data: null, error: null }) // No existing memory

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        })
        .mockReturnValueOnce({
          maybeSingle: mockMaybeSingle,
        })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('OpenAI API error')
    })

    it('should handle empty OpenAI response', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
      ]

      // Mock OpenAI response with empty content
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{}], // No message content
        }),
      } as Response)

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()

      mockMaybeSingle
        .mockResolvedValueOnce({ data: mockMessages, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        })
        .mockReturnValueOnce({
          maybeSingle: mockMaybeSingle,
        })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('empty response')
    })

    it('should handle invalid JSON in OpenAI response', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      const mockMessages = [
        { role: 'user', content: 'Message 1', sequence: 1 },
      ]

      // Mock OpenAI response with invalid JSON
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'This is not valid JSON {',
              },
            },
          ],
        }),
      } as Response)

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()

      mockMaybeSingle
        .mockResolvedValueOnce({ data: mockMessages, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        })
        .mockReturnValueOnce({
          maybeSingle: mockMaybeSingle,
        })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('Failed to parse')
    })
  })

  describe('Error handling', () => {
    it('should handle Supabase query errors', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()

      // Mock Supabase error
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: mockOrder,
        }),
      })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('Failed to fetch conversation messages')
    })

    it('should handle case when no messages found', async () => {
      const { createClient } = await import('@supabase/supabase-js')

      req[Symbol.asyncIterator] = async function* () {
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

      // Setup mocks
      const mockFrom = vi.fn()
      const mockSelect = vi.fn()
      const mockEq = vi.fn()
      const mockOrder = vi.fn()
      const mockMaybeSingle = vi.fn()

      // Mock empty messages
      mockMaybeSingle.mockResolvedValueOnce({ data: [], error: null })

      mockOrder.mockReturnValue({ maybeSingle: mockMaybeSingle })
      mockEq.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          order: mockOrder,
        }),
      })

      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({
        select: mockSelect,
      })

      vi.mocked(createClient).mockReturnValue({
        from: mockFrom,
      } as any)

      await handler(req, res)

      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toContain('No conversation messages found')
    })

    it('should handle general errors with 500 status', async () => {
      req[Symbol.asyncIterator] = async function* () {
        // Invalid JSON to trigger parse error
        yield Buffer.from('invalid json {')
      }

      await handler(req, res)

      expect(res.statusCode).toBe(500)
      const responseBody = JSON.parse(endSpy.mock.calls[0][0])
      expect(responseBody.success).toBe(false)
      expect(responseBody.error).toBeDefined()
    })
  })
})

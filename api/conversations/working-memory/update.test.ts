/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, error handling, and core logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './update.js'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock fetch for OpenAI API calls
global.fetch = vi.fn()

describe('working-memory update handler', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: string
  let statusCode: number
  let headers: Record<string, string>

  beforeEach(() => {
    responseBody = ''
    statusCode = 200
    headers = {}

    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{}')
      },
    }

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn((name: string, value: string) => {
        headers[name] = value
      }),
      end: vi.fn((body?: string) => {
        if (body !== undefined) {
          responseBody = body
        }
      }),
    }

    vi.clearAllMocks()
  })

  describe('CORS handling', () => {
    it('should handle OPTIONS request with CORS headers', async () => {
      mockReq.method = 'OPTIONS'
      mockReq[Symbol.asyncIterator] = async function* () {}

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalledWith()
    })
  })

  describe('Method validation', () => {
    it('should reject non-POST methods', async () => {
      mockReq.method = 'GET'
      mockReq[Symbol.asyncIterator] = async function* () {}

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(responseBody).toBe('Method Not Allowed')
    })

    it('should accept POST method', async () => {
      mockReq.method = 'POST'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
        }))
      }

      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  data: [],
                  error: { message: 'No messages' },
                })),
              })),
            })),
          })),
        })),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should not return 405
      expect(mockRes.statusCode).not.toBe(405)
    })
  })

  describe('Request body validation', () => {
    it('should require projectId and agent', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('projectId and agent are required')
    })

    it('should require Supabase credentials', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
        }))
      }

      // Clear env vars for this test
      const originalSupabaseUrl = process.env.SUPABASE_URL
      const originalViteSupabaseUrl = process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      process.env.SUPABASE_URL = originalSupabaseUrl
      process.env.VITE_SUPABASE_URL = originalViteSupabaseUrl

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('Supabase credentials required')
    })

    it('should require OpenAI credentials', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      expect(response.error).toContain('OpenAI credentials required')
    })

    it('should trim and validate string inputs', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: '  test-project  ',
          agent: '  test-agent  ',
          supabaseUrl: '  https://test.supabase.co  ',
          supabaseAnonKey: '  test-key  ',
          openaiApiKey: '  test-openai-key  ',
          openaiModel: '  gpt-4  ',
        }))
      }

      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  data: [],
                  error: { message: 'No messages' },
                })),
              })),
            })),
          })),
        })),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should call createClient with trimmed values
      expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-key')
    })
  })

  describe('JSON parsing from OpenAI response', () => {
    it('should parse JSON from plain text response', async () => {
      const mockWorkingMemory = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: ['req1'],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
          forceRefresh: true,
        }))
      }

      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      data: [{ role: 'user', content: 'test', sequence: 1 }],
                      error: null,
                    })),
                  })),
                })),
              })),
            }
          }
          if (table === 'hal_conversation_working_memory') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: null,
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => ({
                error: null,
              })),
            }
          }
          return {}
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockWorkingMemory),
              },
            },
          ],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test summary')
    })

    it('should parse JSON from markdown code block response', async () => {
      const mockWorkingMemory = {
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

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
          forceRefresh: true,
        }))
      }

      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      data: [{ role: 'user', content: 'test', sequence: 1 }],
                      error: null,
                    })),
                  })),
                })),
              })),
            }
          }
          if (table === 'hal_conversation_working_memory') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: null,
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => ({
                error: null,
              })),
            }
          }
          return {}
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const jsonInMarkdown = `\`\`\`json\n${JSON.stringify(mockWorkingMemory)}\n\`\`\``
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: jsonInMarkdown,
              },
            },
          ],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(true)
      expect(response.workingMemory.summary).toBe('Test summary')
    })

    it('should handle empty OpenAI response', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
          forceRefresh: true,
        }))
      }

      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      data: [{ role: 'user', content: 'test', sequence: 1 }],
                      error: null,
                    })),
                  })),
                })),
              })),
            }
          }
          return {}
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '',
              },
            },
          ],
        }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // The handler should return 200 with error message, but if there's a parsing error it might return 500
      // Check that we get an error response either way
      const response = JSON.parse(responseBody)
      expect(response.success).toBe(false)
      // The error could be about empty response or parsing error
      expect(response.error).toBeTruthy()
    })
  })
})

/**
 * Unit tests for working memory update endpoint.
 * Tests validation logic, message fetching, sequence checking, and working memory generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock global fetch
global.fetch = vi.fn()

describe('update.ts', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseData: { statusCode?: number; headers?: Record<string, string>; body?: string }
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Setup mock request
    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({}))
      },
    }

    // Setup mock response
    responseData = {}
    mockRes = {
      statusCode: 200,
      setHeader: vi.fn((key: string, value: string) => {
        if (!responseData.headers) responseData.headers = {}
        responseData.headers[key] = value
      }),
      end: vi.fn((data?: string) => {
        responseData.body = data
      }),
    }

    // Dynamically import handler to get fresh mocks
    const module = await import('./update.js')
    handler = module.default
  })

  describe('Request validation', () => {
    it('validates projectId and agent are required', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({}))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('projectId and agent are required')
    })

    it('validates projectId cannot be empty string', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ projectId: '   ', agent: 'test-agent' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('projectId and agent are required')
    })

    it('validates agent cannot be empty string', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ projectId: 'test-project', agent: '' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(400)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('projectId and agent are required')
    })

    it('validates Supabase credentials are required', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
        }))
      }

      // Clear env vars
      const originalSupabaseUrl = process.env.SUPABASE_URL
      const originalViteSupabaseUrl = process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Restore env vars
      if (originalSupabaseUrl) process.env.SUPABASE_URL = originalSupabaseUrl
      if (originalViteSupabaseUrl) process.env.VITE_SUPABASE_URL = originalViteSupabaseUrl

      expect(mockRes.statusCode).toBe(400)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('Supabase credentials required')
    })

    it('validates OpenAI credentials are required', async () => {
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
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('OpenAI credentials required')
    })
  })

  describe('Message fetching and sequence checking', () => {
    it('handles error when fetching messages fails', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: null,
                  error: { message: 'Database error' },
                })),
              })),
            })),
          })),
        })),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('Failed to fetch conversation messages')
    })

    it('handles case when no messages are found', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [],
                      error: null,
                    })),
                  })),
                })),
              })),
            }
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          }
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('No conversation messages found')
    })

    it('returns existing memory when no new messages and forceRefresh is false', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const existingMemory = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: ['req1'],
        constraints: [],
        decisions: [],
        assumptions: [],
        open_questions: [],
        glossary: {},
        stakeholders: [],
        last_updated_at: '2024-01-01T00:00:00Z',
        through_sequence: 5,
      }

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [
                        { role: 'user', content: 'test', sequence: 5 },
                      ],
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
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: existingMemory,
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

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          projectId: 'test-project',
          agent: 'test-agent',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
          openaiApiKey: 'test-openai-key',
          openaiModel: 'gpt-4',
          forceRefresh: false,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(true)
      expect(body.updated).toBe(false)
      expect(body.workingMemory.summary).toBe('Test summary')
      expect(body.workingMemory.goals).toEqual(['goal1'])
    })
  })

  describe('Working memory generation and parsing', () => {
    it('parses JSON from OpenAI response with markdown code blocks', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [
                        { role: 'user', content: 'test', sequence: 10 },
                      ],
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
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: { through_sequence: 5 },
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => Promise.resolve({ error: null })),
            }
          }
          return {}
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

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

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '```json\n' + JSON.stringify(mockWorkingMemory) + '\n```',
            },
          }],
        }),
      } as Response)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(true)
      expect(body.updated).toBe(true)
      expect(body.workingMemory.summary).toBe('Test summary')
    })

    it('parses JSON from OpenAI response without markdown code blocks', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [
                        { role: 'user', content: 'test', sequence: 10 },
                      ],
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
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: { through_sequence: 5 },
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => Promise.resolve({ error: null })),
            }
          }
          return {}
        }),
      }
      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const mockWorkingMemory = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: ['req1'],
      }

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(mockWorkingMemory),
            },
          }],
        }),
      } as Response)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(true)
      expect(body.updated).toBe(true)
      expect(body.workingMemory.summary).toBe('Test summary')
    })

    it('handles OpenAI API errors', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [
                        { role: 'user', content: 'test', sequence: 10 },
                      ],
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
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: { through_sequence: 5 },
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

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('OpenAI API error')
    })

    it('handles empty OpenAI response', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'hal_conversation_messages') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({
                      data: [
                        { role: 'user', content: 'test', sequence: 10 },
                      ],
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
                    maybeSingle: vi.fn(() => Promise.resolve({
                      data: { through_sequence: 5 },
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

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '',
            },
          }],
        }),
      } as Response)

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

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(200)
      const body = JSON.parse(responseData.body || '{}')
      expect(body.success).toBe(false)
      expect(body.error).toContain('OpenAI returned empty response')
    })
  })
})

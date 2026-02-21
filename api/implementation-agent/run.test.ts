/**
 * Unit tests for implementation agent run endpoint.
 * 
 * Tests verify:
 * - Ticket ID parsing from message
 * - Model selection logic
 * - Prompt building (extracting goal, deliverable, criteria from markdown)
 * - Handler validation (method, API key, configuration checks)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { parseTicketId, getModel, extractTicketSections } from './run.js'
import handler from './run.js'

// Mock dependencies
vi.mock('../agent-runs/_shared.js', () => ({
  humanReadableCursorError: (status: number, detail?: string) => {
    if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
    if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
    if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
    if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
    const suffix = detail ? ` — ${String(detail).slice(0, 100)}` : ''
    return `Cursor API request failed (${status})${suffix}`
  },
  readJsonBody: async (req: IncomingMessage) => {
    const chunks: Uint8Array[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    if (!raw) return {}
    return JSON.parse(raw) as unknown
  },
}))

describe('parseTicketId', () => {
  it('should extract ticket ID from "Implement ticket XXXX" message', () => {
    expect(parseTicketId('Implement ticket 0046')).toBe('0046')
    expect(parseTicketId('Implement ticket 1234')).toBe('1234')
  })

  it('should handle case-insensitive parsing', () => {
    expect(parseTicketId('IMPLEMENT TICKET 0123')).toBe('0123')
    expect(parseTicketId('implement ticket 0056')).toBe('0056')
    expect(parseTicketId('Implement Ticket 0078')).toBe('0078')
  })

  it('should return null for invalid formats', () => {
    expect(parseTicketId('Implement something')).toBeNull()
    expect(parseTicketId('Implement ticket 123')).toBeNull() // 3 digits
    expect(parseTicketId('')).toBeNull()
  })

  it('should match first 4 digits even if more digits follow', () => {
    // The regex matches exactly 4 digits, so "12345" will match "1234"
    expect(parseTicketId('Implement ticket 12345')).toBe('1234')
  })
})

describe('getModel', () => {
  beforeEach(() => {
    delete process.env.CURSOR_IMPLEMENTATION_MODEL
    delete process.env.CURSOR_AGENT_MODEL
  })

  it('should use model from request body when provided', () => {
    expect(getModel({ model: 'claude-4-sonnet' })).toBe('claude-4-sonnet')
    expect(getModel({ model: 'gpt-5.2' })).toBe('gpt-5.2')
  })

  it('should trim whitespace from body model', () => {
    expect(getModel({ model: '  claude-4-sonnet  ' })).toBe('claude-4-sonnet')
  })

  it('should use CURSOR_IMPLEMENTATION_MODEL env var when model not in body', () => {
    process.env.CURSOR_IMPLEMENTATION_MODEL = 'gpt-5.2'
    expect(getModel({})).toBe('gpt-5.2')
    expect(getModel({ model: '' })).toBe('gpt-5.2')
  })

  it('should fall back to CURSOR_AGENT_MODEL when CURSOR_IMPLEMENTATION_MODEL not set', () => {
    process.env.CURSOR_AGENT_MODEL = 'claude-3-opus'
    expect(getModel({})).toBe('claude-3-opus')
  })

  it('should return empty string when no model is configured', () => {
    expect(getModel({})).toBe('')
    expect(getModel({ model: '' })).toBe('')
  })

  it('should prioritize body model over environment variables', () => {
    process.env.CURSOR_IMPLEMENTATION_MODEL = 'env-model'
    process.env.CURSOR_AGENT_MODEL = 'fallback-model'
    expect(getModel({ model: 'body-model' })).toBe('body-model')
  })
})

describe('extractTicketSections', () => {
  it('should extract goal, deliverable, and criteria from complete ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Improve maintainability of the codebase.

## Human-verifiable deliverable (UI-only)

A non-technical user can verify the improvement.

## Acceptance criteria (UI-only)

- [ ] Test coverage increased
- [ ] Maintainability improved
`

    const result = extractTicketSections(bodyMd)
    expect(result.goal).toBe('Improve maintainability of the codebase.')
    expect(result.deliverable).toBe('A non-technical user can verify the improvement.')
    expect(result.criteria).toContain('Test coverage increased')
    expect(result.criteria).toContain('Maintainability improved')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Improve maintainability.
`

    const result = extractTicketSections(bodyMd)
    expect(result.goal).toBe('Improve maintainability.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should handle sections in different order', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

- [ ] First criteria

## Goal (one sentence)

The goal text.

## Human-verifiable deliverable (UI-only)

The deliverable text.
`

    const result = extractTicketSections(bodyMd)
    expect(result.goal).toBe('The goal text.')
    expect(result.deliverable).toBe('The deliverable text.')
    expect(result.criteria).toContain('First criteria')
  })

  it('should trim whitespace from extracted sections', () => {
    const bodyMd = `## Goal (one sentence)

  Goal with whitespace  

## Human-verifiable deliverable (UI-only)

  Deliverable with whitespace  

## Acceptance criteria (UI-only)

  Criteria with whitespace  
`

    const result = extractTicketSections(bodyMd)
    expect(result.goal).toBe('Goal with whitespace')
    expect(result.deliverable).toBe('Deliverable with whitespace')
    expect(result.criteria).toBe('Criteria with whitespace')
  })

  it('should handle empty ticket body', () => {
    const result = extractTicketSections('')
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })
})

describe('Implementation agent run handler', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number
  let writtenStages: unknown[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    writtenStages = []
    responseBody = null
    responseStatus = 0

    // Setup request mock
    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({}))
      },
    }

    // Setup response mock
    const statusCodeObj = { value: 0 }
    mockRes = {
      get statusCode() {
        return statusCodeObj.value
      },
      set statusCode(value: number) {
        statusCodeObj.value = value
        responseStatus = value
      },
      setHeader: vi.fn(),
      write: vi.fn((data: string) => {
        try {
          const stage = JSON.parse(data.trim())
          writtenStages.push(stage)
        } catch {
          // Not JSON, ignore
        }
      }),
      end: vi.fn((body?: string) => {
        responseStatus = statusCodeObj.value
        if (body) {
          try {
            responseBody = JSON.parse(body)
          } catch {
            responseBody = body
          }
        }
      }),
      flushHeaders: vi.fn(),
    }

    // Mock global fetch
    global.fetch = vi.fn() as any

    // Clear environment variables
    delete process.env.CURSOR_API_KEY
    delete process.env.VITE_CURSOR_API_KEY
    delete process.env.CURSOR_IMPLEMENTATION_MODEL
    delete process.env.CURSOR_AGENT_MODEL
    delete process.env.HAL_API_URL
    delete process.env.APP_ORIGIN
  })

  describe('Method validation', () => {
    it('should reject non-POST methods with 405', async () => {
      mockReq.method = 'GET'

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(405)
      expect(responseBody).toBe('Method Not Allowed')
    })

    it('should accept POST method', async () => {
      mockReq.method = 'POST'
      process.env.CURSOR_API_KEY = 'test-key'

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ message: 'Implement ticket 0001' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should not return 405
      expect(responseStatus).not.toBe(405)
    })
  })

  describe('Ticket ID parsing', () => {
    it('should extract ticket ID from message and attempt to fetch ticket', async () => {
      process.env.CURSOR_API_KEY = 'test-key'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ message: 'Implement ticket 0046' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should have attempted to fetch ticket (indicates ticket ID was parsed)
      const failedStage = writtenStages.find((s: any) => s.stage === 'failed' && s.status === 'ticket-not-found')
      expect(failedStage).toBeDefined()
    })

    it('should reject messages without valid ticket ID format', async () => {
      process.env.CURSOR_API_KEY = 'test-key'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ message: 'Implement something' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const failedStage = writtenStages.find((s: any) => s.stage === 'failed' && s.status === 'invalid-input')
      expect(failedStage).toBeDefined()
      expect(failedStage).toMatchObject({
        error: expect.stringContaining('Say "Implement ticket XXXX"'),
      })
    })
  })

  describe('Configuration validation', () => {
    it('should reject requests when CURSOR_API_KEY is not configured', async () => {
      // No CURSOR_API_KEY set
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ message: 'Implement ticket 0001' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const failedStage = writtenStages.find((s: any) => s.stage === 'failed' && s.status === 'not-configured')
      expect(failedStage).toBeDefined()
      expect(failedStage).toMatchObject({
        error: expect.stringContaining('Cursor API is not configured'),
      })
    })

    it('should reject requests when Supabase is not configured', async () => {
      process.env.CURSOR_API_KEY = 'test-key'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ message: 'Implement ticket 0001' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const failedStage = writtenStages.find((s: any) => s.stage === 'failed' && s.status === 'ticket-not-found')
      expect(failedStage).toBeDefined()
      expect(failedStage).toMatchObject({
        error: expect.stringContaining('Supabase not configured'),
      })
    })

    it('should reject requests when repo is not configured', async () => {
      process.env.CURSOR_API_KEY = 'test-key'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(
          JSON.stringify({
            message: 'Implement ticket 0001',
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-key',
          })
        )
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const failedStage = writtenStages.find((s: any) => s.stage === 'failed' && s.status === 'no-repo')
      expect(failedStage).toBeDefined()
      expect(failedStage).toMatchObject({
        error: expect.stringContaining('No GitHub repo connected'),
      })
    })
  })
})

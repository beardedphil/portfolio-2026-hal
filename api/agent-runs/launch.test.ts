/**
 * Tests for agent launch endpoint.
 * 
 * These tests verify that:
 * - Request validation (method, body parsing)
 * - Ticket fetching and error handling
 * - QA ticket moving logic
 * - Prompt building for implementation and QA agents
 * - Cursor API launch and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as session from '../_lib/github/session.js'
import * as githubApi from '../_lib/github/githubApi.js'
import * as config from '../_lib/github/config.js'

// Mock dependencies
vi.mock('./_shared.js', () => ({
  readJsonBody: vi.fn(),
  json: vi.fn(),
  validateMethod: vi.fn(),
  getServerSupabase: vi.fn(),
  getCursorApiKey: vi.fn(),
  humanReadableCursorError: vi.fn(),
  appendProgress: vi.fn(),
  upsertArtifact: vi.fn(),
}))

vi.mock('../_lib/github/session.js', () => ({
  getSession: vi.fn(),
}))

vi.mock('../_lib/github/githubApi.js', () => ({
  listBranches: vi.fn(),
  ensureInitialCommit: vi.fn(),
}))

vi.mock('../_lib/github/config.js', () => ({
  getOrigin: vi.fn(),
}))

// Mock global fetch
global.fetch = vi.fn()

describe('Agent launch handler', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  // Helper to create a Supabase query chain
  function createSupabaseChain(maybeSingleResult?: any) {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      not: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(maybeSingleResult || { data: null, error: null })),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    }
    return chain
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockSupabase = {
      from: vi.fn(() => createSupabaseChain()),
    }

    // Setup request mock
    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{}')
      },
    }

    // Setup response mock
    responseBody = undefined
    responseStatus = 0
    mockRes = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((body?: unknown) => {
        responseBody = body
      }),
    }

    // Setup shared module mocks
    vi.mocked(shared.readJsonBody).mockResolvedValue({})
    vi.mocked(shared.json).mockImplementation((res, status, body) => {
      responseStatus = status
      responseBody = body
      if (res.end) res.end(JSON.stringify(body))
    })
    vi.mocked(shared.validateMethod).mockReturnValue(true)
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(shared.humanReadableCursorError).mockImplementation((status, detail) => 
      `Error ${status}: ${detail || ''}`
    )
    vi.mocked(shared.appendProgress).mockImplementation((progress, message) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    })
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })

    // Setup other module mocks
    vi.mocked(session.getSession).mockRejectedValue(new Error('Session not available'))
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')

    // Setup fetch mock
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    } as Response)
  })

  describe('Request validation', () => {
    it('should reject non-POST requests', async () => {
      mockReq.method = 'GET'
      vi.mocked(shared.validateMethod).mockReturnValue(false)
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(shared.validateMethod).toHaveBeenCalledWith(mockReq, mockRes, 'POST')
    })

    it('should require repoFullName and ticketNumber', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
      })
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(responseStatus).toBe(400)
      const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
      expect(bodyStr).toContain('required')
    })

    it('should accept valid request body', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1) {
          // Ticket fetch
          return createSupabaseChain({
            data: { pk: 'ticket-pk', ticket_number: 123, display_id: '0123', body_md: '## Goal\nTest goal', kanban_column_id: 'col-todo' },
            error: null,
          })
        }
        if (callCount === 2) {
          // Run insert
          const insertChain = createSupabaseChain()
          insertChain.insert = vi.fn(() => insertChain)
          insertChain.select = vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { run_id: 'run-id' }, error: null })),
          }))
          return insertChain
        }
        // Update chains
        return createSupabaseChain({ data: null, error: null })
      })
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
    })
  })

  describe('Ticket fetching', () => {
    it('should return 404 when ticket is not found', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
      })
      
      mockSupabase.from.mockReturnValue(
        createSupabaseChain({
          data: null,
          error: { message: 'Not found' },
        })
      )
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(responseStatus).toBe(404)
      const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
      expect(bodyStr).toContain('not found')
    })

    it('should extract ticket data correctly', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal\n## Human-verifiable deliverable\nTest deliverable',
          kanban_column_id: 'col-todo',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      expect(chain.eq).toHaveBeenCalledWith('repo_full_name', 'test/repo')
      expect(chain.eq).toHaveBeenCalledWith('ticket_number', 123)
    })
  })

  describe('QA ticket moving logic', () => {
    it('should move QA ticket from QA column to Doing when QA agent starts', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const ticketChain = mockSupabase.from().select()
      ticketChain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal',
          kanban_column_id: 'col-qa',
        },
        error: null,
      })
      
      const doingChain = mockSupabase.from().select()
      doingChain.order.mockReturnValue(doingChain)
      doingChain.limit.mockResolvedValue({
        data: [{ kanban_position: 5 }],
        error: null,
      })
      
      const updateChain = mockSupabase.from().update()
      updateChain.eq.mockResolvedValue({ error: null })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      // Mock multiple from() calls
      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1) return ticketChain
        if (callCount === 2) return doingChain
        if (callCount === 3) return updateChain
        if (callCount === 4) return insertChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          update: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          order: vi.fn(() => createChain()),
          limit: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      // Verify update was called to move ticket
      expect(updateChain.update).toHaveBeenCalled()
    })

    it('should not move ticket if not in QA column', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal',
          kanban_column_id: 'col-doing', // Not in QA column
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      // Should not call update for ticket movement
      const updateCalls = mockSupabase.from.mock.calls.filter(call => 
        call[0] === 'tickets' && callCount > 1
      )
      expect(updateCalls.length).toBeLessThanOrEqual(1) // Only the initial select
    })
  })

  describe('Prompt building', () => {
    it('should build implementation prompt correctly', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal (one sentence)\nImplement feature\n## Human-verifiable deliverable (UI-only)\nUser sees button\n## Acceptance criteria (UI-only)\n- [ ] Button works',
          kanban_column_id: 'col-todo',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      // Verify fetch was called with correct prompt
      expect(global.fetch).toHaveBeenCalled()
      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const fetchBody = JSON.parse(fetchCall[1]?.body as string)
      expect(fetchBody.prompt.text).toContain('Implement this ticket')
      expect(fetchBody.prompt.text).toContain('HAL-0123')
      expect(fetchBody.prompt.text).toContain('Implement feature')
    })

    it('should build QA prompt correctly', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal (one sentence)\nTest feature\n## Human-verifiable deliverable (UI-only)\nUser sees result\n## Acceptance criteria (UI-only)\n- [ ] Feature works',
          kanban_column_id: 'col-qa',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      // Verify fetch was called with QA prompt
      expect(global.fetch).toHaveBeenCalled()
      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const fetchBody = JSON.parse(fetchCall[1]?.body as string)
      expect(fetchBody.prompt.text).toContain('QA this ticket implementation')
      expect(fetchBody.prompt.text).toContain('HAL-0123')
    })
  })

  describe('Cursor API launch', () => {
    it('should handle successful Cursor API launch', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal',
          kanban_column_id: 'col-todo',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      const updateChain = mockSupabase.from().update()
      updateChain.eq.mockResolvedValue({ error: null })
      
      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        if (callCount === 3) return updateChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          update: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cursor.com/v0/agents',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        })
      )
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'polling',
        cursorAgentId: 'test-agent-id',
      })
    })

    it('should handle Cursor API errors', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal',
          kanban_column_id: 'col-todo',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      const updateChain = mockSupabase.from().update()
      updateChain.eq.mockResolvedValue({ error: null })
      
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)
      
      vi.mocked(shared.humanReadableCursorError).mockReturnValue('Cursor API authentication failed')
      
      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        if (callCount === 3) return updateChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          update: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'failed',
        error: expect.stringContaining('authentication failed'),
      })
    })

    it('should handle invalid JSON response from Cursor API', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })
      
      const chain = mockSupabase.from().select()
      chain.maybeSingle.mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          ticket_number: 123,
          display_id: 'HAL-0123',
          body_md: '## Goal\nTest goal',
          kanban_column_id: 'col-todo',
        },
        error: null,
      })
      
      const insertChain = mockSupabase.from().insert()
      insertChain.select.mockReturnValue(insertChain)
      insertChain.maybeSingle.mockResolvedValue({
        data: { run_id: 'run-id' },
        error: null,
      })
      
      const updateChain = mockSupabase.from().update()
      updateChain.eq.mockResolvedValue({ error: null })
      
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'invalid json',
      } as Response)
      
      let callCount = 0
      mockSupabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) return chain
        if (callCount === 2) return insertChain
        if (callCount === 3) return updateChain
        return createChain()
      })
      
      function createChain() {
        return {
          select: vi.fn(() => createChain()),
          insert: vi.fn(() => createChain()),
          update: vi.fn(() => createChain()),
          eq: vi.fn(() => createChain()),
          maybeSingle: vi.fn(),
        }
      }
      
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'failed',
        error: expect.stringContaining('Invalid response'),
      })
    })
  })
})

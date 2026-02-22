/**
 * Unit tests for agent-runs/launch.ts
 * 
 * These tests verify:
 * - Input validation (repoFullName, ticketNumber, message)
 * - Agent type determination and routing
 * - Prompt text building for implementation and QA agents
 * - Ticket fetching and error handling
 * - Cursor API launch logic
 * - QA ticket movement from QA column to Doing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as githubApi from '../_lib/github/githubApi.js'
import * as session from '../_lib/github/session.js'
import * as config from '../_lib/github/config.js'

// Mock dependencies
vi.mock('./_shared.js')
vi.mock('../_lib/github/githubApi.js')
vi.mock('../_lib/github/session.js')
vi.mock('../_lib/github/config.js')

describe('agent-runs/launch handler', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup Supabase mock with proper chaining
    const createChain = () => ({
      select: vi.fn(() => createChain()),
      insert: vi.fn(() => createChain()),
      update: vi.fn(() => createChain()),
      delete: vi.fn(() => createChain()),
      upsert: vi.fn(() => createChain()),
      eq: vi.fn(() => createChain()),
      not: vi.fn(() => createChain()),
      order: vi.fn(() => createChain()),
      limit: vi.fn(() => createChain()),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    })
    
    mockSupabase = {
      from: vi.fn(() => createChain()),
    }

    // Setup request mock
    mockReq = {
      method: 'POST',
      headers: {
        'x-forwarded-host': 'test.example.com',
        'x-forwarded-proto': 'https',
      },
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({}))
      },
    }

    // Setup response mock
    responseBody = null
    responseStatus = 0
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
      end: vi.fn((body: string) => {
        // Capture status code from statusCodeObj.value (set by json function)
        responseStatus = statusCodeObj.value
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    }

    // Mock shared functions
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(shared.appendProgress).mockImplementation((progress, message) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    })
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })
    // Note: validateMethod and json are not mocked - they're real functions
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Input validation', () => {
    it('should reject request without repoFullName', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ agentType: 'implementation', ticketNumber: 123 }))
      }

      try {
        await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      } catch (err) {
        console.error('Handler threw error:', err)
        throw err
      }

      // Check if end was called
      expect(mockRes.end).toHaveBeenCalled()
      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'repoFullName is required.',
      })
    })

    it('should reject implementation agent without ticketNumber', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ agentType: 'implementation', repoFullName: 'test/repo' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'ticketNumber is required.',
      })
    })

    it('should reject project-manager agent without message', async () => {
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ agentType: 'project-manager', repoFullName: 'test/repo' }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'message is required for project-manager runs.',
      })
    })
  })

  describe('Agent type determination', () => {
    it('should default to implementation when agentType is not specified', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ repoFullName: 'test/repo', ticketNumber: 123 }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
      expect(responseStatus).toBe(200)
    })

    it('should handle qa agent type correctly', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const positionChain = {
        select: vi.fn(() => positionChain),
        eq: vi.fn(() => positionChain),
        order: vi.fn(() => positionChain),
        limit: vi.fn(() => positionChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const ticketUpdateChain = {
        update: vi.fn(() => ticketUpdateChain),
        eq: vi.fn(() => ticketUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(positionChain)
        .mockReturnValueOnce(ticketUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({ agentType: 'qa', repoFullName: 'test/repo', ticketNumber: 123 }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-123',
        status: 'polling',
        cursorAgentId: 'agent-123',
      })
    })
  })

  describe('Prompt text building', () => {
    it('should build implementation prompt with ticket details', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal (one sentence)\nImplement feature\n## Human-verifiable deliverable (UI-only)\nUser sees button\n## Acceptance criteria (UI-only)\n- [ ] Button works',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
          defaultBranch: 'main',
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(call =>
        typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        expect(launchBody.prompt.text).toContain('Implement this ticket.')
        expect(launchBody.prompt.text).toContain('test/repo')
        expect(launchBody.prompt.text).toContain('HAL-0123')
        expect(launchBody.prompt.text).toContain('Implement feature')
        expect(launchBody.prompt.text).toContain('User sees button')
        expect(launchBody.prompt.text).toContain('Button works')
      }
    })

    it('should build QA prompt with instructions loading section', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'qa',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(call =>
        typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        expect(launchBody.prompt.text).toContain('QA this ticket implementation')
        expect(launchBody.prompt.text).toContain('MANDATORY: Load Your Instructions First')
        expect(launchBody.prompt.text).toContain('/api/instructions/get')
      }
    })
  })

  describe('Ticket fetching and error handling', () => {
    it('should return 404 when ticket is not found', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }

      mockSupabase.from.mockReturnValueOnce(ticketChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 999,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({
        error: 'Ticket 999 not found for repo test/repo.',
      })
    })

    it('should handle ticket fetch error', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }

      mockSupabase.from.mockReturnValueOnce(ticketChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('not found'),
      })
    })
  })

  describe('QA ticket movement', () => {
    it('should move QA ticket from col-qa to col-doing when QA agent starts', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const positionChain = {
        select: vi.fn(() => positionChain),
        eq: vi.fn(() => positionChain),
        order: vi.fn(() => positionChain),
        limit: vi.fn(() => positionChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [{ kanban_position: 5 }],
          error: null,
        }),
      }

      const ticketUpdateChain = {
        update: vi.fn(() => ticketUpdateChain),
        eq: vi.fn(() => ticketUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(positionChain)
        .mockReturnValueOnce(ticketUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'qa',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(ticketUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          kanban_column_id: 'col-doing',
          kanban_position: 6,
        })
      )
      expect(ticketUpdateChain.eq).toHaveBeenCalledWith('pk', 'ticket-pk')
    })

    it('should not move ticket if agent type is not QA', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should not call tickets.update for moving
      const updateCalls = mockSupabase.from.mock.calls.filter(call => call[0] === 'tickets')
      expect(updateCalls.length).toBe(0)
    })
  })

  describe('Cursor API launch', () => {
    it('should handle successful Cursor API launch', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-123', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cursor.com/v0/agents',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
            'Content-Type': 'application/json',
          }),
        })
      )

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-123',
        status: 'polling',
        cursorAgentId: 'agent-123',
      })
    })

    it('should handle Cursor API error response', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-123',
        status: 'failed',
        error: expect.any(String),
      })
    })

    it('should handle invalid JSON response from Cursor API', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => 'not valid json',
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-123',
        status: 'failed',
        error: expect.stringContaining('Invalid response'),
      })
    })

    it('should handle missing agent ID in Cursor API response', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'CREATING' }), // no id field
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify({
          agentType: 'implementation',
          repoFullName: 'test/repo',
          ticketNumber: 123,
        }))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-123',
        status: 'failed',
        error: expect.stringContaining('agent ID'),
      })
    })
  })
})

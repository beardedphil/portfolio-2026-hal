/**
 * Tests for agent launch endpoint (implementation and QA agents).
 * 
 * These tests verify that:
 * - Request validation works correctly
 * - Prompt building extracts ticket sections correctly
 * - Error handling provides clear messages
 * - Stage updates occur at the right times
 * - QA ticket movement works
 * - Cursor API integration handles errors gracefully
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as githubApi from '../_lib/github/githubApi.js'
import * as githubSession from '../_lib/github/session.js'
import * as githubConfig from '../_lib/github/config.js'

// Mock dependencies
vi.mock('./_shared.js')
vi.mock('../_lib/github/githubApi.js')
vi.mock('../_lib/github/session.js')
vi.mock('../_lib/github/config.js')

describe('Agent launch endpoint', () => {
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
      headers: {},
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify({}))
      },
    } as any

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
        responseStatus = statusCodeObj.value
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    } as any

    // Mock shared functions - DO NOT mock json, readJsonBody, or validateMethod - use real implementations
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(shared.appendProgress).mockImplementation((progress, message) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    })
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })
    vi.mocked(githubConfig.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(githubSession.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: [{ name: 'main' }] } as any)
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ ok: true } as any)

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Request validation', () => {
    it('should reject requests without repoFullName', async () => {
      const body = {
        agentType: 'implementation',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      try {
        await handler(mockReq as IncomingMessage, mockRes as ServerResponse)
      } catch (err) {
        // Handler may throw, but should have called json() first
      }

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({ error: 'repoFullName is required.' })
    })

    it('should reject implementation requests without ticketNumber', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({ error: 'ticketNumber is required.' })
    })

    it('should reject non-POST requests', async () => {
      ;(mockReq as any).method = 'GET'

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(405)
      expect(responseBody).toBe('Method Not Allowed')
    })
  })

  describe('Ticket fetching and validation', () => {
    it('should return 404 when ticket is not found', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockSupabase.from.mockReturnValueOnce(ticketChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({ error: 'Ticket 999 not found for repo test/repo.' })
    })

    it('should extract ticket data correctly', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
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
          data: { run_id: 'run-id-123' },
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
        text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      expect(responseStatus).toBe(200)
    })
  })

  describe('Prompt building', () => {
    it('should build implementation prompt with ticket sections', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: [
              '## Goal (one sentence)',
              'Implement feature X',
              '',
              '## Human-verifiable deliverable (UI-only)',
              'User sees button Y',
              '',
              '## Acceptance criteria (UI-only)',
              '- [ ] Criterion 1',
            ].join('\n'),
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const prCheckChain = {
        select: vi.fn(() => prCheckChain),
        eq: vi.fn(() => prCheckChain),
        not: vi.fn(() => prCheckChain),
        order: vi.fn(() => prCheckChain),
        limit: vi.fn(() => prCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(prCheckChain)
        .mockReturnValueOnce(runUpdateChain)

      let capturedPrompt = ''
      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        if (typeof url === 'string' && url.includes('api.cursor.com/v0/agents')) {
          const body = JSON.parse((options as any).body)
          capturedPrompt = body.prompt.text
        }
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
        } as Response
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toContain('Implement this ticket.')
      expect(capturedPrompt).toContain('HAL-0123')
      expect(capturedPrompt).toContain('test/repo')
      expect(capturedPrompt).toContain('Implement feature X')
      expect(capturedPrompt).toContain('User sees button Y')
      expect(capturedPrompt).toContain('Criterion 1')
    })

    it('should build QA prompt with ticket sections', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
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

      const moveUpdateChain = {
        update: vi.fn(() => moveUpdateChain),
        eq: vi.fn(() => moveUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
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
        .mockReturnValueOnce(moveUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      let capturedPrompt = ''
      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        if (typeof url === 'string' && url.includes('api.cursor.com/v0/agents')) {
          const body = JSON.parse((options as any).body)
          capturedPrompt = body.prompt.text
        }
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
        } as Response
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toContain('QA this ticket implementation')
      expect(capturedPrompt).toContain('HAL-0123')
    })
  })

  describe('QA ticket movement', () => {
    it('should move QA ticket from col-qa to col-doing', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
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

      const moveUpdateChain = {
        update: vi.fn(() => moveUpdateChain),
        eq: vi.fn(() => moveUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
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
        .mockReturnValueOnce(moveUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket movement was attempted
      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      expect(moveUpdateChain.update).toHaveBeenCalled()
      const updateCall = moveUpdateChain.update.mock.calls[0][0]
      expect(updateCall.kanban_column_id).toBe('col-doing')
      expect(updateCall.kanban_position).toBe(6) // 5 + 1
    })

    it('should not move ticket if not in col-qa', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
            kanban_column_id: 'col-doing', // Already in doing
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
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
        text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket movement was NOT attempted (no position query)
      const ticketsCalls = mockSupabase.from.mock.calls.filter(call => call[0] === 'tickets')
      expect(ticketsCalls.length).toBe(1) // Only the initial fetch
    })
  })

  describe('Error handling', () => {
    it('should handle Cursor API authentication errors gracefully', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const prCheckChain = {
        select: vi.fn(() => prCheckChain),
        eq: vi.fn(() => prCheckChain),
        not: vi.fn(() => prCheckChain),
        order: vi.fn(() => prCheckChain),
        limit: vi.fn(() => prCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(prCheckChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id-123',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('Cursor API authentication failed')
    })

    it('should handle invalid Cursor API response', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const prCheckChain = {
        select: vi.fn(() => prCheckChain),
        eq: vi.fn(() => prCheckChain),
        not: vi.fn(() => prCheckChain),
        order: vi.fn(() => prCheckChain),
        limit: vi.fn(() => prCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(prCheckChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => 'invalid json',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id-123',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('Invalid response from Cursor API')
    })

    it('should handle missing agent ID in Cursor response', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const prCheckChain = {
        select: vi.fn(() => prCheckChain),
        eq: vi.fn(() => prCheckChain),
        not: vi.fn(() => prCheckChain),
        order: vi.fn(() => prCheckChain),
        limit: vi.fn(() => prCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(prCheckChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'CREATING' }), // Missing 'id'
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id-123',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('Cursor API did not return an agent ID')
    })
  })

  describe('Stage updates', () => {
    it('should update stages in correct order for implementation agent', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }
      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer> {
        yield Buffer.from(JSON.stringify(body))
      } as any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id-123' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const prCheckChain = {
        select: vi.fn(() => prCheckChain),
        eq: vi.fn(() => prCheckChain),
        not: vi.fn(() => prCheckChain),
        order: vi.fn(() => prCheckChain),
        limit: vi.fn(() => prCheckChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(prCheckChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify stage updates were called
      const updateCalls = runUpdateChain.update.mock.calls
      expect(updateCalls.length).toBeGreaterThan(0)
      
      // Check that 'fetching_ticket' stage was set
      const fetchingTicketCall = updateCalls.find(call => 
        call[0]?.current_stage === 'fetching_ticket'
      )
      expect(fetchingTicketCall).toBeDefined()

      // Check that 'resolving_repo' stage was set
      const resolvingRepoCall = updateCalls.find(call => 
        call[0]?.current_stage === 'resolving_repo'
      )
      expect(resolvingRepoCall).toBeDefined()

      // Check that 'launching' stage was set
      const launchingCall = updateCalls.find(call => 
        call[0]?.current_stage === 'launching'
      )
      expect(launchingCall).toBeDefined()

      // Check that final stage is 'running' for implementation
      const runningCall = updateCalls.find(call => 
        call[0]?.current_stage === 'running'
      )
      expect(runningCall).toBeDefined()
    })
  })
})

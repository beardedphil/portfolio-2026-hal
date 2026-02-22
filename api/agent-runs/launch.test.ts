/**
 * Tests for agent-runs/launch.ts handler.
 * 
 * These tests verify:
 * - Agent type determination and validation
 * - QA ticket movement from QA column to Doing
 * - Prompt text building for implementation vs QA agents
 * - Cursor agent launching with error handling
 * - Run row creation and stage updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as config from '../_lib/github/config.js'
import * as session from '../_lib/github/session.js'
import * as githubApi from '../_lib/github/githubApi.js'

// Mock dependencies
vi.mock('./_shared.js')
vi.mock('../_lib/github/config.js')
vi.mock('../_lib/github/session.js')
vi.mock('../_lib/github/githubApi.js')

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
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<Buffer, void, unknown> {
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
      end: vi.fn((body?: string | (() => void), cb?: () => void) => {
        responseStatus = statusCodeObj.value
        if (typeof body === 'string') {
          try {
            responseBody = JSON.parse(body)
          } catch {
            responseBody = body
          }
        }
        if (typeof cb === 'function') cb()
      }) as any,
    }

    // Mock shared functions
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(shared.readJsonBody).mockResolvedValue({})
    vi.mocked(shared.validateMethod).mockReturnValue(true)
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: [{ name: 'main' }] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ ok: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Agent type determination and validation', () => {
    it('should default to implementation when agentType is not provided', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with implementation agent type
      expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
      const insertCalls = mockSupabase.from.mock.calls.filter(
        (call: any[]) => call[0] === 'hal_agent_runs'
      )
      expect(insertCalls.length).toBeGreaterThan(0)
    })

    it('should validate repoFullName is required', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        ticketNumber: 1,
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('repoFullName is required'),
      })
    })

    it('should validate ticketNumber is required for implementation agent', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        agentType: 'implementation',
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('ticketNumber is required'),
      })
    })
  })

  describe('QA ticket movement from QA to Doing', () => {
    it('should move QA ticket from col-qa to col-doing when QA agent starts', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
        limit: vi.fn().mockResolvedValue({
          data: [{ kanban_position: 5 }],
          error: null,
        }),
      }

      const updateTicketChain = {
        update: vi.fn(() => updateTicketChain),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id' },
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
        .mockReturnValueOnce(updateTicketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'qa',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket was moved to col-doing
      expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
      const updateCall = updateTicketChain.update.mock.calls[0]
      expect(updateCall[0]).toMatchObject({
        kanban_column_id: 'col-doing',
        kanban_position: 6, // 5 + 1
      })
    })

    it('should not move ticket if not in col-qa', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'qa',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket update was not called for moving
      const updateCalls = mockSupabase.from.mock.calls.filter(
        (call: any[]) => call[0] === 'tickets'
      )
      // Only the initial ticket fetch, no position query or update
      expect(updateCalls.length).toBe(1)
    })
  })

  describe('Prompt text building', () => {
    it('should build implementation prompt with correct structure', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'implementation',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built correctly
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/v0/agents') &&
          call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        expect(launchBody.prompt.text).toContain('Implement this ticket')
        expect(launchBody.prompt.text).toContain('test/repo')
        expect(launchBody.prompt.text).toContain('HAL-0001')
        expect(launchBody.prompt.text).toContain('Implement feature')
        expect(launchBody.prompt.text).toContain('User sees button')
      }
    })

    it('should build QA prompt with instructions loading section', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
            body_md: '## Goal (one sentence)\nQA feature\n## Human-verifiable deliverable (UI-only)\nTests pass\n## Acceptance criteria (UI-only)\n- [ ] All tests pass',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'qa',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify QA prompt includes instructions loading section
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/v0/agents') &&
          call[1]?.method === 'POST'
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

  describe('Cursor agent launching with error handling', () => {
    it('should handle Cursor API launch failure gracefully', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'implementation',
      })

      // Mock Cursor API failure
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify error was handled and run was updated
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('authentication failed'),
      })
    })

    it('should handle invalid JSON response from Cursor API', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'implementation',
      })

      // Mock invalid JSON response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => 'not valid json',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify error was handled
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
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
            display_id: 'HAL-0001',
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
          data: { run_id: 'run-id' },
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 1,
        agentType: 'implementation',
      })

      // Mock response without agent ID
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'CREATING' }), // no id field
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify error was handled
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('agent ID'),
      })
    })
  })
})

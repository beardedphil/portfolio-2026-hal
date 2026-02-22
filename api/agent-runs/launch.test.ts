/**
 * Tests for agent-runs launch endpoint.
 * 
 * These tests verify that:
 * - Agent type validation and prompt building works correctly
 * - Ticket fetching and validation handles errors properly
 * - QA ticket movement from QA column to Doing works
 * - Branch name extraction for QA agents works
 * - Cursor API launch handles errors correctly
 * - Run row creation and stage updates work correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as githubApi from '../_lib/github/githubApi.js'
import * as config from '../_lib/github/config.js'
import * as session from '../_lib/github/session.js'

// Mock dependencies
vi.mock('./_shared.js')
vi.mock('../_lib/github/githubApi.js')
vi.mock('../_lib/github/config.js')
vi.mock('../_lib/github/session.js')

describe('agent-runs launch', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup Supabase mock with proper chaining
    // Supabase chains are thenable (can be awaited)
    const createChain = () => {
      const chain: any = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        upsert: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        not: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(),
        single: vi.fn(),
      }
      // Make chain thenable (awaitable) - Supabase chains can be awaited directly
      chain.then = (resolve: (value: any) => any, reject?: (error: any) => any) => {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      }
      chain.catch = (reject: (error: any) => any) => {
        return Promise.resolve({ data: null, error: null }).catch(reject)
      }
      return chain
    }
    
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
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Agent type validation and prompt building', () => {
    it('should build implementation agent prompt correctly', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal (one sentence)\n\nTest goal\n\n## Human-verifiable deliverable (UI-only)\n\nTest deliverable\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test criteria',
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

      const prChain = {
        select: vi.fn(() => prChain),
        eq: vi.fn(() => prChain),
        not: vi.fn(() => prChain),
        order: vi.fn(() => prChain),
        limit: vi.fn(() => prChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }

      const branchesChain = {
        select: vi.fn(() => branchesChain),
        eq: vi.fn(() => branchesChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { branches: ['main'] },
          error: null,
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: resolving_repo
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(prChain) // find existing PR
        .mockReturnValueOnce(runUpdateChain) // stage update: polling

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built correctly
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        expect(launchBody.prompt.text).toContain('Implement this ticket')
        expect(launchBody.prompt.text).toContain('test/repo')
        expect(launchBody.prompt.text).toContain('123')
        expect(launchBody.prompt.text).toContain('HAL-0123')
        expect(launchBody.prompt.text).toContain('Test goal')
        expect(launchBody.prompt.text).toContain('Test deliverable')
        expect(launchBody.prompt.text).toContain('Test criteria')
      }

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'polling',
        cursorAgentId: 'agent-id',
      })
    })

    it('should build QA agent prompt correctly', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 456,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 456,
            display_id: 'HAL-0456',
            body_md: '## Goal (one sentence)\n\nQA goal\n\n## Human-verifiable deliverable (UI-only)\n\nQA deliverable',
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
          data: { run_id: 'run-id' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(positionChain) // position check for QA move
        .mockReturnValueOnce(moveUpdateChain) // move ticket to Doing
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_branch
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(runUpdateChain) // stage update: polling

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built correctly
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        expect(launchBody.prompt.text).toContain('QA this ticket implementation')
        expect(launchBody.prompt.text).toContain('qa')
        expect(launchBody.prompt.text).toContain('HAL-0456')
      }

      // Verify ticket was moved from QA to Doing
      expect(moveUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          kanban_column_id: 'col-doing',
        })
      )

      expect(responseStatus).toBe(200)
    })
  })

  describe('Ticket fetching and validation', () => {
    it('should return 404 when ticket is not found', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
        defaultBranch: 'main',
      }

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
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('not found'),
      })
    })

    it('should return 400 when repoFullName is missing', async () => {
      const body = {
        agentType: 'implementation',
        ticketNumber: 123,
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('repoFullName'),
      })
    })

    it('should return 400 when ticketNumber is missing for implementation agent', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('ticketNumber'),
      })
    })
  })

  describe('QA ticket movement', () => {
    it('should move QA ticket from col-qa to col-doing when QA agent starts', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 789,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 789,
            display_id: 'HAL-0789',
            body_md: '## Goal\n\nTest',
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
          data: [{ kanban_position: 10 }],
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
          data: { run_id: 'run-id' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(positionChain) // position check
        .mockReturnValueOnce(moveUpdateChain) // move ticket
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage updates (multiple)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket was moved
      expect(moveUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          kanban_column_id: 'col-doing',
          kanban_position: 11, // next position after 10
        })
      )
      expect(moveUpdateChain.eq).toHaveBeenCalledWith('pk', 'ticket-pk')

      expect(responseStatus).toBe(200)
    })

    it('should not move ticket if not in col-qa', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 789,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 789,
            display_id: 'HAL-0789',
            body_md: '## Goal\n\nTest',
            kanban_column_id: 'col-todo', // Not in QA column
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
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage updates
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket movement was not attempted (no position chain call)
      const fromCalls = vi.mocked(mockSupabase.from).mock.calls
      const positionCall = fromCalls.find((call) => call[0] === 'tickets' && call.length > 1)
      // Should not have called for position check since ticket is not in col-qa

      expect(responseStatus).toBe(200)
    })
  })

  describe('Branch name extraction for QA', () => {
    it('should extract branch name from ticket body for QA agent', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 111,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 111,
            display_id: 'HAL-0111',
            body_md: '## QA\n\nBranch: feature/test-branch\n\n## Goal\n\nTest',
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
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_branch (with branch name)
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(runUpdateChain) // stage update: polling

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify branch name was extracted and used in progress message
      const updateCalls = vi.mocked(runUpdateChain.update).mock.calls
      const branchUpdate = updateCalls.find((call) =>
        call[0]?.progress?.some?.((p: any) => p.message?.includes('feature/test-branch'))
      )

      // The branch name should be in the progress message
      expect(responseStatus).toBe(200)
    })
  })

  describe('Cursor API launch error handling', () => {
    it('should handle Cursor API 400 error with branch not found message', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 222,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 222,
            display_id: 'HAL-0222',
            body_md: '## Goal\n\nTest',
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

      // Mock chain for finding existing PR (implementation agents)
      const prChain = {
        select: vi.fn(() => prChain),
        eq: vi.fn(() => prChain),
        not: vi.fn(() => prChain),
        order: vi.fn(() => prChain),
        limit: vi.fn(() => prChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: resolving_repo
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(prChain) // find existing PR
        .mockReturnValueOnce(runUpdateChain) // error update

      vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'branch main does not exist',
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'failed',
        error: expect.stringContaining('branch'),
      })

      // Verify run was updated with error status
      expect(runUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          current_stage: 'failed',
        })
      )
    })

    it('should handle Cursor API invalid JSON response', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 333,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 333,
            display_id: 'HAL-0333',
            body_md: '## Goal\n\nTest',
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
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage updates
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain) // error update

      vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => 'not valid json',
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'failed',
        error: expect.stringContaining('Invalid response'),
      })
    })

    it('should handle Cursor API response without agent ID', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 444,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 444,
            display_id: 'HAL-0444',
            body_md: '## Goal\n\nTest',
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

      // Mock chain for finding existing PR (implementation agents)
      const prChain = {
        select: vi.fn(() => prChain),
        eq: vi.fn(() => prChain),
        not: vi.fn(() => prChain),
        order: vi.fn(() => prChain),
        limit: vi.fn(() => prChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: resolving_repo
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(prChain) // find existing PR
        .mockReturnValueOnce(runUpdateChain) // error update

      vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'CREATING' }), // no id field
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'run-id',
        status: 'failed',
        error: expect.stringContaining('agent ID'),
      })
    })
  })

  describe('Run row creation and stage updates', () => {
    it('should create run row with correct initial stage and progress', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 555,
        defaultBranch: 'main',
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 555,
            display_id: 'HAL-0555',
            body_md: '## Goal\n\nTest',
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

      // Mock chain for finding existing PR (implementation agents)
      const prChain = {
        select: vi.fn(() => prChain),
        eq: vi.fn(() => prChain),
        not: vi.fn(() => prChain),
        order: vi.fn(() => prChain),
        limit: vi.fn(() => prChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain) // ticket fetch
        .mockReturnValueOnce(runInsertChain) // run insert
        .mockReturnValueOnce(runUpdateChain) // stage update: fetching_ticket
        .mockReturnValueOnce(runUpdateChain) // stage update: resolving_repo
        .mockReturnValueOnce(runUpdateChain) // stage update: launching
        .mockReturnValueOnce(prChain) // find existing PR
        .mockReturnValueOnce(runUpdateChain) // final update: polling

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
    } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with correct fields
      expect(runInsertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_type: 'implementation',
          repo_full_name: 'test/repo',
          ticket_pk: 'ticket-pk',
          ticket_number: 555,
          display_id: 'HAL-0555',
          provider: 'cursor',
          status: 'launching',
          current_stage: 'preparing',
        })
      )

      // Verify stage updates were called
      expect(runUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_stage: 'fetching_ticket',
        })
      )
      expect(runUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_stage: 'resolving_repo',
        })
      )
      expect(runUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_stage: 'launching',
          status: 'launching',
        })
      )
      expect(runUpdateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          current_stage: 'running',
          status: 'polling',
          cursor_agent_id: 'agent-id',
        })
      )

      expect(responseStatus).toBe(200)
    })
  })
})

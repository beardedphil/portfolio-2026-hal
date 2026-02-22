/**
 * Tests for agent-runs launch endpoint.
 * 
 * These tests verify that:
 * - Agent type is correctly determined from request body
 * - Ticket validation and error handling works correctly
 * - Prompt text generation differs for implementation vs QA agents
 * - Run row creation succeeds with correct data
 * - Cursor API launch is called with correct parameters
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

describe('agent-runs launch', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  // Helper to create update chain mocks
  const createUpdateChain = () => ({
    update: vi.fn(() => createUpdateChain()),
    eq: vi.fn(() => createUpdateChain()),
  })

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
    vi.mocked(shared.validateMethod).mockReturnValue(true)
    vi.mocked(shared.readJsonBody).mockResolvedValue({})
    vi.mocked(shared.json).mockImplementation((res, status, body) => {
      responseStatus = status
      responseBody = body
    })
    vi.mocked(shared.appendProgress).mockImplementation((progress, msg) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message: msg })
      return arr
    })
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Agent type determination', () => {
    it('should default to implementation when agentType is not provided', async () => {
      let insertCallData: any
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
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
        insert: vi.fn((data) => {
          insertCallData = data
          return runInsertChain
        }),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      const linkedPrChain = {
        select: vi.fn(() => linkedPrChain),
        eq: vi.fn(() => linkedPrChain),
        not: vi.fn(() => linkedPrChain),
        order: vi.fn(() => linkedPrChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(linkedPrChain)

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with implementation agent type
      expect(insertCallData?.agent_type).toBe('implementation')
    })

    it('should use qa agent type when explicitly provided', async () => {
      let insertCallData: any
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const doingChain = {
        select: vi.fn(() => doingChain),
        eq: vi.fn(() => doingChain),
        order: vi.fn(() => doingChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const ticketUpdateChain = {
        update: vi.fn(() => ticketUpdateChain),
        eq: vi.fn(() => ticketUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn((data) => {
          insertCallData = data
          return runInsertChain
        }),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(doingChain)
        .mockReturnValueOnce(ticketUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with qa agent type
      expect(insertCallData?.agent_type).toBe('qa')
    })
  })

  describe('Ticket validation', () => {
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

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
        defaultBranch: 'main',
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect((responseBody as any)?.error).toContain('not found')
    })

    it('should return 400 when repoFullName is missing', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        ticketNumber: 123,
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any)?.error).toContain('repoFullName is required')
    })

    it('should return 400 when ticketNumber is missing for implementation agent', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any)?.error).toContain('ticketNumber is required')
    })
  })

  describe('Prompt text generation', () => {
    it('should generate implementation prompt with ticket details', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 123,
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
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      const linkedPrChain = {
        select: vi.fn(() => linkedPrChain),
        eq: vi.fn(() => linkedPrChain),
        not: vi.fn(() => linkedPrChain),
        order: vi.fn(() => linkedPrChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(createUpdateChain()) // fetching_ticket
        .mockReturnValueOnce(createUpdateChain()) // resolving_repo
        .mockReturnValueOnce(createUpdateChain()) // launching stage
        .mockReturnValueOnce(createUpdateChain()) // launching status
        .mockReturnValueOnce(linkedPrChain)
        .mockReturnValueOnce(createUpdateChain()) // after launch update

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      let fetchCall: any
      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        fetchCall = { url, options }
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
        } as Response
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify Cursor API was called
      expect(global.fetch).toHaveBeenCalled()
      const requestBody = JSON.parse(fetchCall.options.body)
      const promptText = requestBody.prompt.text

      // Verify prompt contains implementation-specific content
      expect(promptText).toContain('Implement this ticket')
      expect(promptText).toContain('**agentType**: implementation')
      expect(promptText).toContain('HAL-0123')
      expect(promptText).toContain('Implement feature')
      expect(promptText).toContain('User sees button')
      expect(promptText).toContain('Button works')
    })

    it('should generate QA prompt with different instructions', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal (one sentence)\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const doingChain = {
        select: vi.fn(() => doingChain),
        eq: vi.fn(() => doingChain),
        order: vi.fn(() => doingChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const ticketUpdateChain = {
        update: vi.fn(() => ticketUpdateChain),
        eq: vi.fn(() => ticketUpdateChain),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(doingChain)
        .mockReturnValueOnce(ticketUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(createUpdateChain()) // fetching_ticket
        .mockReturnValueOnce(createUpdateChain()) // fetching_branch
        .mockReturnValueOnce(createUpdateChain()) // launching stage
        .mockReturnValueOnce(createUpdateChain()) // launching status
        .mockReturnValueOnce(createUpdateChain()) // after launch update

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      let fetchCall: any
      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        fetchCall = { url, options }
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
        } as Response
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify Cursor API was called
      expect(global.fetch).toHaveBeenCalled()
      const requestBody = JSON.parse(fetchCall.options.body)
      const promptText = requestBody.prompt.text

      // Verify prompt contains QA-specific content
      expect(promptText).toContain('QA this ticket implementation')
      expect(promptText).toContain('**agentType**: qa')
      expect(promptText).not.toContain('Implement this ticket')
    })
  })

  describe('Cursor API launch', () => {
    it('should launch Cursor agent with correct parameters for implementation', async () => {
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
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
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      const linkedPrChain = {
        select: vi.fn(() => linkedPrChain),
        eq: vi.fn(() => linkedPrChain),
        not: vi.fn(() => linkedPrChain),
        order: vi.fn(() => linkedPrChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(createUpdateChain()) // fetching_ticket
        .mockReturnValueOnce(createUpdateChain()) // resolving_repo
        .mockReturnValueOnce(createUpdateChain()) // launching stage
        .mockReturnValueOnce(createUpdateChain()) // launching status
        .mockReturnValueOnce(linkedPrChain)
        .mockReturnValueOnce(createUpdateChain()) // after launch update

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      let fetchCall: any
      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        fetchCall = { url, options }
        return {
          ok: true,
          text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
        } as Response
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify Cursor API was called with correct endpoint
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

      const requestBody = JSON.parse(fetchCall.options.body)
      expect(requestBody.source.repository).toBe('https://github.com/test/repo')
      expect(requestBody.source.ref).toBe('main')
      expect(requestBody.target.branchName).toBe('ticket/0123-implementation')
      expect(requestBody.target.autoCreatePr).toBe(true)
    })

    it('should handle Cursor API errors gracefully', async () => {
      const allUpdateCalls: any[] = []
      
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
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
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      const createUpdateChain = () => {
        const chain = {
          update: vi.fn((data) => {
            allUpdateCalls.push(data)
            return chain
          }),
          eq: vi.fn(() => chain),
        }
        return chain
      }

      const linkedPrChain = {
        select: vi.fn(() => linkedPrChain),
        eq: vi.fn(() => linkedPrChain),
        not: vi.fn(() => linkedPrChain),
        order: vi.fn(() => linkedPrChain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(createUpdateChain()) // fetching_ticket
        .mockReturnValueOnce(createUpdateChain()) // resolving_repo
        .mockReturnValueOnce(createUpdateChain()) // launching stage
        .mockReturnValueOnce(createUpdateChain()) // launching status
        .mockReturnValueOnce(linkedPrChain)
        .mockReturnValueOnce(createUpdateChain()) // Error handling update

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      })

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Branch main does not exist',
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify error response was sent with failed status
      expect(responseStatus).toBe(200)
      expect((responseBody as any)?.status).toBe('failed')
      expect((responseBody as any)?.error).toBeDefined()
      
      // Verify run was updated with failed status
      const failedUpdate = allUpdateCalls.find((data: any) => data?.status === 'failed')
      expect(failedUpdate).toBeDefined()
      expect(failedUpdate?.current_stage).toBe('failed')
      expect(failedUpdate?.error).toBeDefined()
    })
  })
})

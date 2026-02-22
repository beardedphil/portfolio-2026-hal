/**
 * Unit tests for agent-runs/launch.ts
 * 
 * These tests verify:
 * - Agent type determination from request body
 * - Input validation (repoFullName, ticketNumber, message)
 * - Prompt text building for implementation vs QA agents
 * - Ticket fetching and error handling
 * - QA ticket movement logic
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
    
    // Setup Supabase mock - will be overridden per test
    mockSupabase = {
      from: vi.fn(),
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
    let statusCodeValue = 0
    mockRes = {
      get statusCode() {
        return statusCodeValue
      },
      set statusCode(value: number) {
        statusCodeValue = value
      },
      setHeader: vi.fn(),
      end: vi.fn((body: string) => {
        // Capture status code at the time end() is called
        responseStatus = statusCodeValue
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    }

    // Mock shared functions
    vi.mocked(shared.validateMethod).mockImplementation((req, res, method) => {
      if (req.method === method) return true
      res.statusCode = 405
      res.end('Method Not Allowed')
      return false
    })
    // readJsonBody will be mocked per-test to return the test body
    vi.mocked(shared.readJsonBody).mockImplementation(async (req) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return {}
      return JSON.parse(raw) as unknown
    })
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(shared.appendProgress).mockImplementation((arr, msg) => {
      const result = Array.isArray(arr) ? [...arr] : []
      result.push({ at: new Date().toISOString(), message: msg })
      return result
    })
    vi.mocked(shared.humanReadableCursorError).mockImplementation((status, text) => `Cursor API error: ${status}`)
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true } as any)
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('Agent type determination', () => {
    it('should default to implementation when agentType is not provided', async () => {
      const body = {
        repoFullName: 'test/repo',
        ticketNumber: 123,
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
          data: { run_id: 'test-run-id' },
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
        .mockReturnValueOnce(runUpdateChain) // stage update 1
        .mockReturnValueOnce(runUpdateChain) // stage update 2
        .mockReturnValueOnce(runUpdateChain) // stage update 3
        .mockReturnValueOnce(runUpdateChain) // stage update 4

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with implementation agent type
      expect(runInsertChain.insert).toHaveBeenCalled()
      const insertCall = vi.mocked(runInsertChain.insert).mock.calls[0]?.[0]
      expect(insertCall).toMatchObject({
        agent_type: 'implementation',
      })
    })

    it('should use qa agent type when explicitly provided', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
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
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const ticketSelectChain = {
        select: vi.fn(() => ticketSelectChain),
        eq: vi.fn(() => ticketSelectChain),
        order: vi.fn(() => ticketSelectChain),
        limit: vi.fn(() => ticketSelectChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
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

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(ticketSelectChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with qa agent type
      expect(runInsertChain.insert).toHaveBeenCalled()
      const insertCall = vi.mocked(runInsertChain.insert).mock.calls[0]?.[0]
      expect(insertCall).toMatchObject({
        agent_type: 'qa',
      })
    })
  })

  describe('Input validation', () => {
    it('should return 400 error when repoFullName is missing', async () => {
      const body = {
        ticketNumber: 123,
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'repoFullName is required.',
      })
    })

    it('should return 400 error when ticketNumber is missing for implementation agent', async () => {
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
        error: 'ticketNumber is required.',
      })
    })

    it('should return 400 error when message is missing for project-manager agent', async () => {
      const body = {
        agentType: 'project-manager',
        repoFullName: 'test/repo',
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'test-run-id' },
          error: null,
        }),
      }

      mockSupabase.from.mockReturnValueOnce(runInsertChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'message is required for project-manager runs.',
      })
    })
  })

  describe('Prompt text building', () => {
    it('should build implementation prompt with ticket details', async () => {
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
            body_md: '## Goal\nTest goal\n## Human-verifiable deliverable\nTest deliverable\n## Acceptance criteria\n- [ ] Test criteria',
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
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built correctly
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
        expect(launchBody.prompt.text).toContain('Test goal')
        expect(launchBody.prompt.text).toContain('Test deliverable')
        expect(launchBody.prompt.text).toContain('Test criteria')
      }
    })

    it('should build QA prompt with instructions loading section', async () => {
      const body = {
        agentType: 'qa',
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
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const ticketSelectChain = {
        select: vi.fn(() => ticketSelectChain),
        eq: vi.fn(() => ticketSelectChain),
        order: vi.fn(() => ticketSelectChain),
        limit: vi.fn(() => ticketSelectChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: [],
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

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(ticketSelectChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify QA prompt includes instructions loading section
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

  describe('Ticket fetching', () => {
    it('should return 404 when ticket is not found', async () => {
      const body = {
        repoFullName: 'test/repo',
        ticketNumber: 999,
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
        error: 'Ticket 999 not found for repo test/repo.',
      })
    })

    it('should handle ticket fetch error', async () => {
      const body = {
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }

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
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({
        error: 'Ticket 123 not found for repo test/repo.',
      })
    })
  })

  describe('QA ticket movement', () => {
    it('should move QA ticket from col-qa to col-doing when QA agent starts', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
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
            body_md: '## Goal\nTest goal',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const ticketSelectChain = {
        select: vi.fn(() => ticketSelectChain),
        eq: vi.fn(() => ticketSelectChain),
        order: vi.fn(() => ticketSelectChain),
        limit: vi.fn(() => ticketSelectChain),
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
        .mockReturnValueOnce(ticketSelectChain)
        .mockReturnValueOnce(ticketUpdateChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket was moved to col-doing
      expect(ticketUpdateChain.update).toHaveBeenCalled()
      const updateCall = vi.mocked(ticketUpdateChain.update).mock.calls[0]?.[0]
      expect(updateCall).toMatchObject({
        kanban_column_id: 'col-doing',
        kanban_position: 6, // next position after 5
      })
      expect(ticketUpdateChain.eq).toHaveBeenCalledWith('pk', 'ticket-pk')
    })

    it('should not move ticket if not in col-qa', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
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
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify ticket update was not called for movement
      const updateCalls = vi.mocked(mockSupabase.from).mock.calls.filter(
        call => call[0] === 'tickets' && call[1]?.update
      )
      expect(updateCalls.length).toBe(0)
    })
  })
})

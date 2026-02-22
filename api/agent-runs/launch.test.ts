/**
 * Tests for agent-runs/launch.ts handler.
 * 
 * These tests verify:
 * - Agent type determination from request body
 * - Prompt building for implementation and QA agents
 * - Ticket body parsing (Goal, Deliverable, Acceptance criteria)
 * - Stage update logic for different agent types
 * - Error handling for missing/invalid inputs
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
    vi.mocked(shared.validateMethod).mockReturnValue(true)
    vi.mocked(shared.readJsonBody).mockResolvedValue({})
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('agent type determination', () => {
    it('should default to implementation when agentType is not provided', async () => {
      const body = {
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with implementation agent type
      expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
      const insertCalls = mockSupabase.from.mock.calls.filter(call => call[0] === 'hal_agent_runs')
      expect(insertCalls.length).toBeGreaterThan(0)
      // Check the insert call by finding the chain that has insert called
      const insertChain = runInsertChain
      expect(insertChain.insert).toHaveBeenCalled()
      const insertArgs = insertChain.insert.mock.calls[0]?.[0]
      expect(insertArgs?.agent_type).toBe('implementation')
    })

    it('should use qa agent type when explicitly provided', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with qa agent type
      expect(runInsertChain.insert).toHaveBeenCalled()
      const insertArgs = runInsertChain.insert.mock.calls.find(call => call[0]?.agent_type === 'qa')?.[0]
      expect(insertArgs?.agent_type).toBe('qa')
    })

    it('should use project-manager agent type when provided', async () => {
      const body = {
        agentType: 'project-manager',
        repoFullName: 'test/repo',
        message: 'Test message',
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-id' },
          error: null,
        }),
      }

      mockSupabase.from.mockReturnValueOnce(runInsertChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify run was created with project-manager agent type
      expect(runInsertChain.insert).toHaveBeenCalled()
      const insertArgs = runInsertChain.insert.mock.calls[0]?.[0]
      expect(insertArgs?.agent_type).toBe('project-manager')
      expect(insertArgs?.provider).toBe('openai')
      expect(responseStatus).toBe(200)
    })
  })

  describe('prompt building', () => {
    it('should build implementation prompt with ticket details', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 456,
        defaultBranch: 'main',
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketBodyMd = [
        '## Goal (one sentence)',
        'Implement a feature',
        '',
        '## Human-verifiable deliverable (UI-only)',
        'User sees a button',
        '',
        '## Acceptance criteria (UI-only)',
        '- [ ] Button is visible',
        '- [ ] Button is clickable',
      ].join('\n')

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0456',
            body_md: ticketBodyMd,
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built correctly
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        const promptText = launchBody.prompt.text
        expect(promptText).toContain('Implement this ticket')
        expect(promptText).toContain('test/repo')
        expect(promptText).toContain('HAL-0456')
        expect(promptText).toContain('Implement a feature')
        expect(promptText).toContain('User sees a button')
        expect(promptText).toContain('Button is visible')
      }
    })

    it('should build QA prompt with instructions loading section', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 789,
        defaultBranch: 'main',
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketBodyMd = [
        '## Goal (one sentence)',
        'QA a feature',
        '',
        '## Acceptance criteria (UI-only)',
        '- [ ] Feature works',
      ].join('\n')

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0789',
            body_md: ticketBodyMd,
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify QA prompt includes instructions loading section
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        const promptText = launchBody.prompt.text
        expect(promptText).toContain('QA this ticket implementation')
        expect(promptText).toContain('MANDATORY: Load Your Instructions First')
        expect(promptText).toContain('/api/instructions/get')
      }
    })
  })

  describe('ticket body parsing', () => {
    it('should extract Goal, Deliverable, and Acceptance criteria from ticket body', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketBodyMd = [
        '## Goal (one sentence)',
        'Build a widget',
        '',
        '## Human-verifiable deliverable (UI-only)',
        'Widget appears on page',
        '',
        '## Acceptance criteria (UI-only)',
        '- [ ] Widget renders',
        '- [ ] Widget is interactive',
      ].join('\n')

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0999',
            body_md: ticketBodyMd,
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify parsed content appears in prompt
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        const promptText = launchBody.prompt.text
        expect(promptText).toContain('Build a widget')
        expect(promptText).toContain('Widget appears on page')
        expect(promptText).toContain('Widget renders')
        expect(promptText).toContain('Widget is interactive')
      }
    })

    it('should handle missing ticket sections gracefully', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 888,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketBodyMd = 'Some content without proper sections'

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0888',
            body_md: ticketBodyMd,
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt uses fallback text for missing sections
      const fetchCalls = vi.mocked(global.fetch).mock.calls
      const launchCall = fetchCalls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
      )

      expect(launchCall).toBeDefined()
      if (launchCall && launchCall[1]?.body) {
        const launchBody = JSON.parse(launchCall[1].body as string)
        const promptText = launchBody.prompt.text
        expect(promptText).toContain('(not specified)')
      }
    })
  })

  describe('input validation', () => {
    it('should return 400 when repoFullName is missing', async () => {
      const body = {
        ticketNumber: 123,
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('repoFullName is required'),
      })
    })

    it('should return 400 when ticketNumber is missing for implementation agent', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('ticketNumber is required'),
      })
    })

    it('should return 400 when message is missing for project-manager agent', async () => {
      const body = {
        agentType: 'project-manager',
        repoFullName: 'test/repo',
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('message is required for project-manager'),
      })
    })

    it('should return 404 when ticket is not found', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 999,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }

      mockSupabase.from.mockReturnValueOnce(ticketChain)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(404)
      expect(responseBody).toMatchObject({
        error: expect.stringContaining('not found'),
      })
    })
  })

  describe('stage updates', () => {
    it('should update stage to resolving_repo for implementation agent', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 111,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0111',
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify stage was updated to resolving_repo
      expect(runUpdateChain.update).toHaveBeenCalled()
      const updateCalls = runUpdateChain.update.mock.calls
      const resolvingRepoCall = updateCalls.find((call) => call[0]?.current_stage === 'resolving_repo')
      expect(resolvingRepoCall).toBeDefined()
    })

    it('should update stage to fetching_branch for QA agent', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 222,
      }

      vi.mocked(shared.readJsonBody).mockResolvedValueOnce(body)

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk',
            display_id: 'HAL-0222',
            body_md: '## Goal\nTest',
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'agent-id', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify stage was updated to fetching_branch
      expect(runUpdateChain.update).toHaveBeenCalled()
      const updateCalls = runUpdateChain.update.mock.calls
      const fetchingBranchCall = updateCalls.find((call) => call[0]?.current_stage === 'fetching_branch')
      expect(fetchingBranchCall).toBeDefined()
    })
  })
})

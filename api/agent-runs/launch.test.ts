/**
 * Tests for agent-runs/launch.ts handler.
 * 
 * These tests verify:
 * - Request validation (method, required fields)
 * - Agent type determination from body
 * - Prompt building for different agent types
 * - Ticket body parsing (goal, deliverable, criteria)
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
      order: vi.fn(() => createChain()),
      limit: vi.fn(() => createChain()),
      maybeSingle: vi.fn(),
      not: vi.fn(() => createChain()),
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
    vi.mocked(shared.appendProgress).mockImplementation((progress, message) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    })
    vi.mocked(shared.upsertArtifact).mockResolvedValue({ ok: true })
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({ github: { accessToken: 'test-token' } } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ success: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('request validation', () => {
    it('should reject requests with missing repoFullName', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        ticketNumber: 123,
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any)?.error).toBe('repoFullName is required.')
    })

    it('should reject implementation requests with missing ticketNumber', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any)?.error).toBe('ticketNumber is required.')
    })

    it('should reject project-manager requests with missing message', async () => {
      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'project-manager',
        repoFullName: 'test/repo',
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect((responseBody as any)?.error).toBe('message is required for project-manager runs.')
    })
  })

  describe('agent type determination', () => {
    it('should default to implementation when agentType is not provided', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: '## Goal (one sentence)\n\nTest goal',
        kanban_column_id: 'col-todo',
      }

      const mockRunRow = { run_id: 'run-123' }
      let capturedInsertData: any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn((data: any) => {
          capturedInsertData = data
          return runInsertChain
        }),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify that agent_type was set to 'implementation' in the insert
      expect(capturedInsertData).toBeDefined()
      expect(capturedInsertData.agent_type).toBe('implementation')
    })

    it('should use qa when agentType is qa', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: '## Goal (one sentence)\n\nTest goal',
        kanban_column_id: 'col-qa',
      }

      const mockRunRow = { run_id: 'run-123' }
      let capturedInsertData: any

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn((data: any) => {
          capturedInsertData = data
          return runInsertChain
        }),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify that agent_type was set to 'qa' in the insert
      expect(capturedInsertData).toBeDefined()
      expect(capturedInsertData.agent_type).toBe('qa')
    })
  })

  describe('prompt building', () => {
    it('should build implementation prompt with ticket details', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: `## Goal (one sentence)

Implement a feature

## Human-verifiable deliverable (UI-only)

User sees a button

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable`,
        kanban_column_id: 'col-todo',
      }

      const mockRunRow = { run_id: 'run-123' }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn(() => runInsertChain),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      let capturedPrompt: string | undefined
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        if (url === 'https://api.cursor.com/v0/agents') {
          const body = JSON.parse(options.body)
          capturedPrompt = body.prompt.text
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
          }
        }
        return { ok: false, status: 404 }
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toBeDefined()
      expect(capturedPrompt).toContain('Implement this ticket.')
      expect(capturedPrompt).toContain('**agentType**: implementation')
      expect(capturedPrompt).toContain('**repoFullName**: test/repo')
      expect(capturedPrompt).toContain('**ticketNumber**: 123')
      expect(capturedPrompt).toContain('**displayId**: HAL-0123')
      expect(capturedPrompt).toContain('Implement a feature')
      expect(capturedPrompt).toContain('User sees a button')
      expect(capturedPrompt).toContain('Button is visible')
    })

    it('should build QA prompt with ticket details and instructions', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: `## Goal (one sentence)

Test a feature

## Human-verifiable deliverable (UI-only)

Verify button works

## Acceptance criteria (UI-only)

- [ ] Button is tested`,
        kanban_column_id: 'col-qa',
      }

      const mockRunRow = { run_id: 'run-123' }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn(() => runInsertChain),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      let capturedPrompt: string | undefined
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        if (url === 'https://api.cursor.com/v0/agents') {
          const body = JSON.parse(options.body)
          capturedPrompt = body.prompt.text
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
          }
        }
        return { ok: false, status: 404 }
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toBeDefined()
      expect(capturedPrompt).toContain('QA this ticket implementation')
      expect(capturedPrompt).toContain('**agentType**: qa')
      expect(capturedPrompt).toContain('MANDATORY: Load Your Instructions First')
      expect(capturedPrompt).toContain('Test a feature')
      expect(capturedPrompt).toContain('Verify button works')
    })
  })

  describe('ticket body parsing', () => {
    it('should extract goal, deliverable, and criteria from ticket body', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: `## Goal (one sentence)

Build a feature

## Human-verifiable deliverable (UI-only)

User can click button

## Acceptance criteria (UI-only)

- [ ] Feature works
- [ ] Tests pass`,
        kanban_column_id: 'col-todo',
      }

      const mockRunRow = { run_id: 'run-123' }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn(() => runInsertChain),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      let capturedPrompt: string | undefined
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        if (url === 'https://api.cursor.com/v0/agents') {
          const body = JSON.parse(options.body)
          capturedPrompt = body.prompt.text
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
          }
        }
        return { ok: false, status: 404 }
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toBeDefined()
      expect(capturedPrompt).toContain('Build a feature')
      expect(capturedPrompt).toContain('User can click button')
      expect(capturedPrompt).toContain('Feature works')
      expect(capturedPrompt).toContain('Tests pass')
    })

    it('should handle missing sections with fallback text', async () => {
      const mockTicket = {
        pk: 'ticket-pk',
        repo_full_name: 'test/repo',
        ticket_number: 123,
        display_id: 'HAL-0123',
        body_md: 'Some content without sections',
        kanban_column_id: 'col-todo',
      }

      const mockRunRow = { run_id: 'run-123' }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTicket, error: null }),
      }

      const runInsertChain = {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        })),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        insert: vi.fn(() => runInsertChain),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRunRow, error: null }),
        not: vi.fn(() => runChain),
      }

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'tickets') return ticketChain
        if (table === 'hal_agent_runs') return runChain
        return {
          select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
        }
      })

      vi.mocked(shared.readJsonBody).mockResolvedValue({
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
      })

      let capturedPrompt: string | undefined
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        if (url === 'https://api.cursor.com/v0/agents') {
          const body = JSON.parse(options.body)
          capturedPrompt = body.prompt.text
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
          }
        }
        return { ok: false, status: 404 }
      })

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(capturedPrompt).toBeDefined()
      expect(capturedPrompt).toContain('## Goal')
      expect(capturedPrompt).toContain('(not specified)')
      expect(capturedPrompt).toContain('## Human-verifiable deliverable')
      expect(capturedPrompt).toContain('## Acceptance criteria')
    })
  })
})

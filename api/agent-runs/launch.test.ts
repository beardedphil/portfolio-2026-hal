/**
 * Tests for agent-runs/launch.ts
 * 
 * These tests verify:
 * - Ticket body parsing (Goal, Human-verifiable deliverable, Acceptance criteria)
 * - Prompt text building for implementation and QA agents
 * - Agent type handling and routing
 * - Branch name extraction for QA agents
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
vi.mock('../_lib/encryption.js', () => ({
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
  isEncrypted: vi.fn(),
}))
vi.mock('../_lib/github/session.js', () => ({
  getSession: vi.fn(),
}))
vi.mock('../_lib/github/githubApi.js')

describe('agent-runs/launch.ts', () => {
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
      [Symbol.asyncIterator]: async function* (): AsyncGenerator<Buffer, undefined, unknown> {
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
      end: vi.fn((body?: string | (() => void), cb?: () => void) => {
        if (typeof body === 'string') {
          responseStatus = statusCodeObj.value
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
    vi.mocked(shared.appendProgress).mockImplementation((progress, message) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    })
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: [{ name: 'main' }] })
    vi.mocked(githubApi.ensureInitialCommit).mockResolvedValue({ ok: true })

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  describe('ticket body parsing', () => {
    it('should extract Goal, Human-verifiable deliverable, and Acceptance criteria from ticket body', async () => {
      const ticketBody = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

Some constraints.`

      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer, undefined, unknown> {
        yield Buffer.from(JSON.stringify(body))
      }

      // Mock ticket fetch
      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: ticketBody,
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(ticketChain)

      // Mock run creation
      const runChain = {
        insert: vi.fn(() => runChain),
        select: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
      }
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tickets') return ticketChain
        return runChain
      })

      // Mock Cursor API
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify prompt was built with extracted content
      const fetchCall = vi.mocked(global.fetch).mock.calls.find(
        (call) => call[0] === 'https://api.cursor.com/v0/agents'
      )
      expect(fetchCall).toBeDefined()
      const promptText = JSON.parse(fetchCall![1]?.body as string).prompt.text
      expect(promptText).toContain('Add a feature.')
      expect(promptText).toContain('User sees a button.')
      expect(promptText).toContain('- [ ] Item 1')
    })

    it('should handle missing sections gracefully with fallback text', async () => {
      const ticketBody = `## Goal (one sentence)

Add a feature.`

      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer, undefined, unknown> {
        yield Buffer.from(JSON.stringify(body))
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: ticketBody,
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runChain = {
        insert: vi.fn(() => runChain),
        select: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
      }
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tickets') return ticketChain
        return runChain
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const fetchCall = vi.mocked(global.fetch).mock.calls.find(
        (call) => call[0] === 'https://api.cursor.com/v0/agents'
      )
      const promptText = JSON.parse(fetchCall![1]?.body as string).prompt.text
      expect(promptText).toContain('(not specified)')
    })
  })

  describe('prompt text building', () => {
    it('should build implementation agent prompt with correct structure', async () => {
      const body = {
        agentType: 'implementation',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer, undefined, unknown> {
        yield Buffer.from(JSON.stringify(body))
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal (one sentence)\n\nTest goal.',
            kanban_column_id: 'col-todo',
          },
          error: null,
        }),
      }

      const runChain = {
        insert: vi.fn(() => runChain),
        select: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
        update: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        not: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
      }
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tickets') return ticketChain
        return runChain
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const fetchCall = vi.mocked(global.fetch).mock.calls.find(
        (call) => call[0] === 'https://api.cursor.com/v0/agents'
      )
      const promptText = JSON.parse(fetchCall![1]?.body as string).prompt.text
      
      expect(promptText).toContain('Implement this ticket.')
      expect(promptText).toContain('**agentType**: implementation')
      expect(promptText).toContain('POST /api/artifacts/insert-implementation')
      expect(promptText).toContain('git checkout main && git pull origin main')
    })

    it('should build QA agent prompt with correct structure and instructions loading section', async () => {
      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer, undefined, unknown> {
        yield Buffer.from(JSON.stringify(body))
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: '## Goal (one sentence)\n\nTest goal.',
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
        insert: vi.fn(() => runChain),
        update: vi.fn(() => runChain),
        not: vi.fn(() => runChain),
      }
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tickets') return ticketChain
        return runChain
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      const fetchCall = vi.mocked(global.fetch).mock.calls.find(
        (call) => call[0] === 'https://api.cursor.com/v0/agents'
      )
      const promptText = JSON.parse(fetchCall![1]?.body as string).prompt.text
      
      expect(promptText).toContain('QA this ticket implementation')
      expect(promptText).toContain('**agentType**: qa')
      expect(promptText).toContain('POST /api/artifacts/insert-qa')
      expect(promptText).toContain('MANDATORY: Load Your Instructions First')
      expect(promptText).toContain('/api/instructions/get')
    })
  })

  describe('branch name extraction for QA', () => {
    it('should extract branch name from ticket body for QA agents', async () => {
      const ticketBody = `## QA

Branch: feature/test-branch

Some other content.`

      const body = {
        agentType: 'qa',
        repoFullName: 'test/repo',
        ticketNumber: 123,
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* (): AsyncGenerator<Buffer, undefined, unknown> {
        yield Buffer.from(JSON.stringify(body))
      }

      const ticketChain = {
        select: vi.fn(() => ticketChain),
        eq: vi.fn(() => ticketChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            pk: 'ticket-pk-123',
            repo_full_name: 'test/repo',
            ticket_number: 123,
            display_id: 'HAL-0123',
            body_md: ticketBody,
            kanban_column_id: 'col-qa',
          },
          error: null,
        }),
      }

      const runChain = {
        select: vi.fn(() => runChain),
        eq: vi.fn(() => runChain),
        order: vi.fn(() => runChain),
        limit: vi.fn(() => runChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'run-123' },
          error: null,
        }),
        insert: vi.fn(() => runChain),
        update: vi.fn(() => runChain),
        not: vi.fn(() => runChain),
      }
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'tickets') return ticketChain
        return runChain
      })

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ id: 'cursor-agent-123', status: 'CREATING' }),
      } as Response)

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Verify that update was called with branch name in progress
      const updateCalls = runChain.update.mock.calls
      const branchUpdateCall = updateCalls.find((call) => {
        const updateData = call?.[0] as any
        return updateData?.progress?.some?.((p: any) => 
          typeof p === 'object' && p.message?.includes('feature/test-branch')
        )
      })
      expect(branchUpdateCall).toBeDefined()
    })
  })
})

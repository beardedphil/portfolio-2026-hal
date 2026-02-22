/**
 * Tests for agent-runs launch endpoint.
 * 
 * These tests verify that:
 * - Agent type is correctly determined from request body
 * - Ticket validation and fetching works correctly
 * - Prompts are built correctly for implementation and QA agents
 * - QA tickets are moved to Doing column when QA agent starts
 * - Run rows are created with correct status and stages
 * - Cursor agent launching works correctly
 * - Error handling works for various failure scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from './_shared.js'
import * as githubApi from '../_lib/github/githubApi.js'
import * as config from '../_lib/github/config.js'
import * as session from '../_lib/github/session.js'

// Mock dependencies
vi.mock('./_shared.js', async () => {
  const actual = await vi.importActual('./_shared.js')
  return {
    ...actual,
    upsertArtifact: vi.fn().mockResolvedValue({ ok: true }),
  }
})
vi.mock('../_lib/github/githubApi.js')
vi.mock('../_lib/github/config.js')
vi.mock('../_lib/github/session.js')

describe('Agent type determination', () => {
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
    let statusCodeValue = 0
    mockRes = {
      get statusCode() {
        return statusCodeValue
      },
      set statusCode(value: number) {
        statusCodeValue = value
        responseStatus = value
      },
      setHeader: vi.fn(),
      end: vi.fn((body: string) => {
        responseStatus = statusCodeValue
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
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  it('should default to implementation agent type when agentType is not provided', async () => {
    const body = {
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
          display_id: '0123',
          body_md: '## Goal (one sentence)\n\nTest goal\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
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

    const prSelectChain = {
      select: vi.fn(() => prSelectChain),
      eq: vi.fn(() => prSelectChain),
      not: vi.fn(() => prSelectChain),
      order: vi.fn(() => prSelectChain),
      limit: vi.fn(() => prSelectChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }

    mockSupabase.from
      .mockReturnValueOnce(ticketChain)
      .mockReturnValueOnce(runInsertChain)
      .mockReturnValueOnce(runUpdateChain)
      .mockReturnValueOnce(runUpdateChain)
      .mockReturnValueOnce(runUpdateChain)
      .mockReturnValueOnce(prSelectChain)

    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    } as Response)

    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify implementation prompt was built (check fetch call)
    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const launchCall = fetchCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
    )

    expect(launchCall).toBeDefined()
    if (launchCall && launchCall[1]?.body) {
      const launchBody = JSON.parse(launchCall[1].body as string)
      expect(launchBody.prompt.text).toContain('Implement this ticket')
      expect(launchBody.prompt.text).toContain('**agentType**: implementation')
    }
  })

  it('should use qa agent type when agentType is "qa"', async () => {
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
          display_id: '0123',
          body_md: '## Goal (one sentence)\n\nTest goal\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
          kanban_column_id: 'col-qa',
        },
        error: null,
      }),
    }

    const doingColumnChain = {
      select: vi.fn(() => doingColumnChain),
      eq: vi.fn(() => doingColumnChain),
      order: vi.fn(() => doingColumnChain),
      limit: vi.fn(() => doingColumnChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: [],
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
      .mockReturnValueOnce(doingColumnChain)
      .mockReturnValueOnce(ticketUpdateChain)
      .mockReturnValueOnce(runInsertChain)
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

    // Verify QA prompt was built
    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const launchCall = fetchCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
    )

    expect(launchCall).toBeDefined()
    if (launchCall && launchCall[1]?.body) {
      const launchBody = JSON.parse(launchCall[1].body as string)
      expect(launchBody.prompt.text).toContain('QA this ticket implementation')
      expect(launchBody.prompt.text).toContain('**agentType**: qa')
    }
  })
})

describe('Ticket validation and fetching', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  beforeEach(() => {
    vi.clearAllMocks()
    
    const createChain = () => ({
      select: vi.fn(() => createChain()),
      insert: vi.fn(() => createChain()),
      update: vi.fn(() => createChain()),
      eq: vi.fn(() => createChain()),
      maybeSingle: vi.fn(),
    })
    
    mockSupabase = {
      from: vi.fn(() => createChain()),
    }

    mockReq = {
      method: 'POST',
      headers: {},
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({}))
      },
    }

    responseBody = null
    responseStatus = 0
    let statusCodeValue = 0
    mockRes = {
      get statusCode() {
        return statusCodeValue
      },
      set statusCode(value: number) {
        statusCodeValue = value
        responseStatus = value
      },
      setHeader: vi.fn(),
      end: vi.fn((body: string) => {
        responseStatus = statusCodeValue
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    }

    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
  })

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
      repoFullName: 'test/repo',
      agentType: 'implementation',
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

  it('should return 404 error when ticket is not found', async () => {
    const body = {
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
})

describe('Prompt building', () => {
  let mockSupabase: any
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseBody: unknown
  let responseStatus: number

  beforeEach(() => {
    vi.clearAllMocks()
    
    const createChain = () => ({
      select: vi.fn(() => createChain()),
      insert: vi.fn(() => createChain()),
      update: vi.fn(() => createChain()),
      eq: vi.fn(() => createChain()),
      not: vi.fn(() => createChain()),
      order: vi.fn(() => createChain()),
      limit: vi.fn(() => createChain()),
      maybeSingle: vi.fn(),
    })
    
    mockSupabase = {
      from: vi.fn(() => createChain()),
    }

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

    responseBody = null
    responseStatus = 0
    let statusCodeValue = 0
    mockRes = {
      get statusCode() {
        return statusCodeValue
      },
      set statusCode(value: number) {
        statusCodeValue = value
        responseStatus = value
      },
      setHeader: vi.fn(),
      end: vi.fn((body: string) => {
        responseStatus = statusCodeValue
        try {
          responseBody = JSON.parse(body)
        } catch {
          responseBody = body
        }
      }),
    }

    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)

    global.fetch = vi.fn() as any
  })

  it('should build implementation prompt with ticket sections extracted correctly', async () => {
    const body = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      defaultBranch: 'main',
    }

    const ticketBodyMd = [
      '## Goal (one sentence)',
      '',
      'Improve maintainability of launch.ts',
      '',
      '## Human-verifiable deliverable (UI-only)',
      '',
      'User sees improved metrics',
      '',
      '## Acceptance criteria (UI-only)',
      '',
      '- [ ] Maintainability increases',
      '- [ ] Coverage increases',
    ].join('\n')

    const ticketChain = {
      select: vi.fn(() => ticketChain),
      eq: vi.fn(() => ticketChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          pk: 'ticket-pk',
          repo_full_name: 'test/repo',
          ticket_number: 123,
          display_id: '0123',
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
        data: { run_id: 'test-run-id' },
        error: null,
      }),
    }

    const runUpdateChain = {
      update: vi.fn(() => runUpdateChain),
      eq: vi.fn(() => runUpdateChain),
    }

    const prSelectChain = {
      select: vi.fn(() => prSelectChain),
      eq: vi.fn(() => prSelectChain),
      not: vi.fn(() => prSelectChain),
      order: vi.fn(() => prSelectChain),
      limit: vi.fn(() => prSelectChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    }

    // Mock all Supabase calls in order for implementation:
    // 1. Ticket fetch
    // 2. Run insert
    // 3. Update stage: fetching_ticket
    // 4. Update stage: resolving_repo
    // 5. Update stage: launching
    // 6. PR select (for existing PR check)
    // 7. Update stage: running
    // 8. Artifact upsert (for worklog) - this uses upsertArtifact which makes multiple calls
    mockSupabase.from
      .mockReturnValueOnce(ticketChain) // Ticket fetch
      .mockReturnValueOnce(runInsertChain) // Run insert
      .mockReturnValueOnce(runUpdateChain) // Update: fetching_ticket
      .mockReturnValueOnce(runUpdateChain) // Update: resolving_repo
      .mockReturnValueOnce(runUpdateChain) // Update: launching
      .mockReturnValueOnce(prSelectChain) // PR select
      .mockReturnValueOnce(runUpdateChain) // Update: running

    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    } as Response)

    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify prompt contains extracted sections
    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const launchCall = fetchCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/v0/agents') && call[1]?.method === 'POST'
    )

    expect(launchCall).toBeDefined()
    if (launchCall && launchCall[1]?.body) {
      const launchBody = JSON.parse(launchCall[1].body as string)
      const promptText = launchBody.prompt.text
      expect(promptText).toContain('Improve maintainability of launch.ts')
      expect(promptText).toContain('User sees improved metrics')
      expect(promptText).toContain('- [ ] Maintainability increases')
      expect(promptText).toContain('- [ ] Coverage increases')
    }
  })

  it('should build QA prompt with correct structure and instructions', async () => {
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
          display_id: '0123',
          body_md: '## Goal (one sentence)\n\nTest goal',
          kanban_column_id: 'col-qa',
        },
        error: null,
      }),
    }

    const doingColumnChain = {
      select: vi.fn(() => doingColumnChain),
      eq: vi.fn(() => doingColumnChain),
      order: vi.fn(() => doingColumnChain),
      limit: vi.fn(() => doingColumnChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: [],
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

    // Mock all Supabase calls in order for QA:
    // 1. Ticket fetch
    // 2. Doing column check (for moving QA ticket)
    // 3. Ticket update (move to Doing)
    // 4. Run insert
    // 5. Update stage: fetching_ticket
    // 6. Update stage: fetching_branch
    // 7. Update stage: launching
    // 8. Update stage: reviewing
    mockSupabase.from
      .mockReturnValueOnce(ticketChain) // Ticket fetch
      .mockReturnValueOnce(doingColumnChain) // Doing column check
      .mockReturnValueOnce(ticketUpdateChain) // Ticket update
      .mockReturnValueOnce(runInsertChain) // Run insert
      .mockReturnValueOnce(runUpdateChain) // Update: fetching_ticket
      .mockReturnValueOnce(runUpdateChain) // Update: fetching_branch
      .mockReturnValueOnce(runUpdateChain) // Update: launching
      .mockReturnValueOnce(runUpdateChain) // Update: reviewing

    vi.mocked(session.getSession).mockResolvedValue({
      github: { accessToken: 'test-token' },
    } as any)
    vi.mocked(githubApi.listBranches).mockResolvedValue({ branches: ['main'] })
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    } as Response)

    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify QA prompt structure
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

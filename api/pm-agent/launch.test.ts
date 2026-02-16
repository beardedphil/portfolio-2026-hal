/**
 * Tests for PM agent launch endpoint thread lookup/update logic.
 * 
 * These tests verify that:
 * - Conversation threads are correctly mapped to cursor_agent_id
 * - Existing threads are reused when agents are still RUNNING
 * - New agents are created when threads don't exist or agents are FINISHED
 * - Restart functionality clears thread mappings
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from '../agent-runs/_shared.js'
import * as config from '../_lib/github/config.js'

// Mock dependencies
vi.mock('../agent-runs/_shared.js')
vi.mock('../_lib/github/config.js')

describe('PM agent launch thread lookup', () => {
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
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')

    // Mock global fetch
    global.fetch = vi.fn() as any
  })

  it('should create new thread mapping when conversationId and projectId are provided', async () => {
    const body = {
      message: 'Test message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'conv-123',
      projectId: 'proj-456',
    }

    // Setup Supabase chain mocks
    const threadChain = {
      select: vi.fn(() => threadChain),
      eq: vi.fn(() => threadChain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    
    const runInsertChain = {
      insert: vi.fn(() => runInsertChain),
      select: vi.fn(() => runInsertChain),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { run_id: 'test-run-id' }, 
        error: null 
      }),
    }
    
    const runUpdateChain = {
      update: vi.fn(() => runUpdateChain),
      eq: vi.fn(() => runUpdateChain),
    }
    
    const threadUpsertChain = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    
    mockSupabase.from
      .mockReturnValueOnce(threadChain) // thread lookup
      .mockReturnValueOnce(runInsertChain) // run insert
      .mockReturnValueOnce(runUpdateChain) // run update
      .mockReturnValueOnce(threadUpsertChain) // thread upsert
    
    // Mock: cursor agent launch response
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    } as Response)

    // Create request with body
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify thread lookup was called
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    // Verify new agent was created
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
    // Verify thread mapping was stored
    expect(threadUpsertChain.upsert).toHaveBeenCalled()
    // Verify response
    expect(responseStatus).toBe(200)
    expect(responseBody).toMatchObject({
      runId: 'test-run-id',
      status: 'polling',
      cursorAgentId: 'test-agent-id',
    })
  })

  it('should reuse existing thread when agent is RUNNING', async () => {
    const body = {
      message: 'Test message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'conv-123',
      projectId: 'proj-456',
    }

    // Setup Supabase chain mocks
    const threadChain = {
      select: vi.fn(() => threadChain),
      eq: vi.fn(() => threadChain),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { cursor_agent_id: 'existing-agent-id' }, 
        error: null 
      }),
    }
    
    const runSelectChain = {
      select: vi.fn(() => runSelectChain),
      eq: vi.fn(() => runSelectChain),
      order: vi.fn(() => runSelectChain),
      limit: vi.fn(() => runSelectChain),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { run_id: 'existing-run-id', status: 'polling' }, 
        error: null 
      }),
    }
    
    const threadUpsertChain = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    
    mockSupabase.from
      .mockReturnValueOnce(threadChain) // thread lookup
      .mockReturnValueOnce(runSelectChain) // existing run lookup
      .mockReturnValueOnce(threadUpsertChain) // thread upsert
    
    // Mock: agent status check returns RUNNING
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'RUNNING' }),
    } as Response)

    // Create request with body
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify thread lookup was called
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    // Verify agent status was checked
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cursor.com/v0/agents/existing-agent-id',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        }),
      })
    )
    // Verify existing run was found
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
    // Verify response indicates continuation
    expect(responseBody).toMatchObject({
      runId: 'existing-run-id',
      status: 'polling',
      cursorAgentId: 'existing-agent-id',
      isContinuing: true,
    })
  })

  it('should create new agent when existing agent is FINISHED', async () => {
    const body = {
      message: 'Test message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'conv-123',
      projectId: 'proj-456',
    }

    // Setup Supabase chain mocks
    const threadChain = {
      select: vi.fn(() => threadChain),
      eq: vi.fn(() => threadChain),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { cursor_agent_id: 'finished-agent-id' }, 
        error: null 
      }),
    }
    
    const runInsertChain = {
      insert: vi.fn(() => runInsertChain),
      select: vi.fn(() => runInsertChain),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { run_id: 'new-run-id' }, 
        error: null 
      }),
    }
    
    const runUpdateChain = {
      update: vi.fn(() => runUpdateChain),
      eq: vi.fn(() => runUpdateChain),
    }
    
    const threadUpsertChain = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    
    mockSupabase.from
      .mockReturnValueOnce(threadChain) // thread lookup
      .mockReturnValueOnce(runInsertChain) // run insert
      .mockReturnValueOnce(runUpdateChain) // run update
      .mockReturnValueOnce(threadUpsertChain) // thread upsert
    
    // Mock: agent status check returns FINISHED
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'FINISHED' }),
      } as Response)
      // Mock: new agent launch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
      } as Response)

    // Create request with body
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify thread lookup was called
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    // Verify agent status was checked
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cursor.com/v0/agents/finished-agent-id',
      expect.anything()
    )
    // Verify new agent was created
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cursor.com/v0/agents',
      expect.objectContaining({
        method: 'POST',
      })
    )
    // Verify response
    expect(responseBody).toMatchObject({
      runId: 'new-run-id',
      status: 'polling',
      cursorAgentId: 'new-agent-id',
    })
  })

  it('should clear thread mapping when restart is requested', async () => {
    const body = {
      repoFullName: 'test/repo',
      conversationId: 'conv-123',
      projectId: 'proj-456',
      restart: true,
    }

    // Setup Supabase chain mocks
    const deleteChain = {
      delete: vi.fn(() => deleteChain),
      eq: vi.fn(() => deleteChain),
    }
    
    mockSupabase.from.mockReturnValueOnce(deleteChain)

    // Create request with body
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(body))
    }

    await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

    // Verify thread mapping was deleted
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    expect(deleteChain.delete).toHaveBeenCalled()
    expect(deleteChain.eq).toHaveBeenCalledWith('project_id', 'proj-456')
    expect(deleteChain.eq).toHaveBeenCalledWith('conversation_id', 'conv-123')
    // Verify response
    expect(responseBody).toMatchObject({
      success: true,
      message: 'Conversation thread mapping cleared',
    })
  })
})

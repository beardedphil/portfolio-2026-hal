/**
 * Tests for PM agent launch endpoint thread lookup/update logic.
 * 
 * These tests verify that:
 * - Conversation threads are correctly mapped to cursor_agent_id
 * - Existing threads are reused when agents are still RUNNING
 * - New agents are created when threads don't exist or agents are FINISHED
 * - Restart functionality clears thread mappings
 * - JSON body parsing handles various input formats
 * - Prompt text is built correctly with all inputs
 * - Error handling for agent creation failures
 * - Input validation for required fields
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'
import * as shared from '../agent-runs/_shared.js'
import * as config from '../_lib/github/config.js'

// Mock dependencies
vi.mock('../agent-runs/_shared.js', async () => {
  const actual = await vi.importActual<typeof import('../agent-runs/_shared.js')>('../agent-runs/_shared.js')
  return {
    ...actual,
    getServerSupabase: vi.fn(),
    getCursorApiKey: vi.fn(),
    humanReadableCursorError: vi.fn((status: number, detail?: string) => {
      if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
      if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
      if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
      if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
      const suffix = detail ? ` — ${String(detail).slice(0, 140)}` : ''
      return `Cursor API request failed (${status})${suffix}`
    }),
    appendProgress: vi.fn((progress: any[] | null | undefined, message: string) => {
      const arr = Array.isArray(progress) ? progress.slice(-49) : []
      arr.push({ at: new Date().toISOString(), message })
      return arr
    }),
    // Keep readJsonBody and json as actual implementations
    readJsonBody: actual.readJsonBody,
    json: actual.json,
  }
})
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

    // Mock shared functions - but allow readJsonBody to use actual implementation
    vi.mocked(shared.getServerSupabase).mockReturnValue(mockSupabase as any)
    vi.mocked(shared.getCursorApiKey).mockReturnValue('test-api-key')
    vi.mocked(config.getOrigin).mockReturnValue('https://test.example.com')
    
    // readJsonBody will use actual implementation which reads from request async iterator
    // No need to mock it since the request has an async iterator set up in tests

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

  describe('Input validation', () => {
    it('should return 400 when message is missing (non-restart)', async () => {
      const body = {
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'message is required.',
      })
    })

    it('should return 400 when repoFullName is missing', async () => {
      const body = {
        message: 'Test message',
        defaultBranch: 'main',
      }

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'repoFullName is required. Connect a GitHub repo first.',
      })
    })

    it('should allow missing message when restart is true', async () => {
      const body = {
        repoFullName: 'test/repo',
        conversationId: 'conv-123',
        projectId: 'proj-456',
        restart: true,
      }

      const deleteChain = {
        delete: vi.fn(() => deleteChain),
        eq: vi.fn(() => deleteChain),
      }

      mockSupabase.from.mockReturnValueOnce(deleteChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        success: true,
        message: 'Conversation thread mapping cleared',
      })
    })

    it('should return 405 for non-POST methods', async () => {
      mockReq.method = 'GET'

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(405)
      expect(mockRes.end).toHaveBeenCalledWith('Method Not Allowed')
    })
  })

  describe('JSON body parsing', () => {
    it('should parse valid JSON body', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

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
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'test-run-id',
        status: 'polling',
        cursorAgentId: 'test-agent-id',
      })
    })

    it('should handle empty body as empty object', async () => {
      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      mockSupabase.from.mockReturnValueOnce(threadChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        // Empty body
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(400)
      expect(responseBody).toMatchObject({
        error: 'message is required.',
      })
    })

    it('should handle string chunks in request body', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
      }

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
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield JSON.stringify(body) // String chunk instead of Buffer
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
    })
  })

  describe('Agent creation error handling', () => {
    it('should handle Cursor API launch failure', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

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
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain) // For error update

      // Mock: Cursor API returns error
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: '',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('authentication failed')
    })

    it('should handle invalid JSON response from Cursor API', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

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
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain) // For error update

      // Mock: Cursor API returns invalid JSON
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
        runId: '',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('Invalid response from Cursor API')
    })

    it('should handle missing agent ID in Cursor API response', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

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
          error: null,
        }),
      }

      const runUpdateChain = {
        update: vi.fn(() => runUpdateChain),
        eq: vi.fn(() => runUpdateChain),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(runUpdateChain) // For error update

      // Mock: Cursor API returns response without ID
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'CREATING' }), // Missing 'id'
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: '',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('did not return an agent ID')
    })

    it('should handle Supabase run creation failure', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
      }

      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: '',
        status: 'failed',
      })
      expect((responseBody as any).error).toContain('Failed to create run row')
    })
  })

  describe('checkExistingThread edge cases', () => {
    it('should handle fetch failure gracefully when checking agent status', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
        conversationId: 'conv-123',
        projectId: 'proj-456',
      }

      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { cursor_agent_id: 'existing-agent-id' },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'new-run-id' },
          error: null,
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
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(threadUpsertChain)

      // Mock: fetch throws error
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
        } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should create new agent when status check fails
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'new-run-id',
        status: 'polling',
        cursorAgentId: 'new-agent-id',
      })
    })

    it('should handle agent status check returning non-ok response', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
        conversationId: 'conv-123',
        projectId: 'proj-456',
      }

      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { cursor_agent_id: 'existing-agent-id' },
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'new-run-id' },
          error: null,
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
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(threadUpsertChain)

      // Mock: agent status check returns non-ok
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
        } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should create new agent when status check fails
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'new-run-id',
        status: 'polling',
        cursorAgentId: 'new-agent-id',
      })
    })

    it('should handle CREATING status when checking existing thread', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
        conversationId: 'conv-123',
        projectId: 'proj-456',
      }

      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { cursor_agent_id: 'creating-agent-id' },
          error: null,
        }),
      }

      const runSelectChain = {
        select: vi.fn(() => runSelectChain),
        eq: vi.fn(() => runSelectChain),
        order: vi.fn(() => runSelectChain),
        limit: vi.fn(() => runSelectChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'existing-run-id', status: 'polling' },
          error: null,
        }),
      }

      const threadUpsertChain = {
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }

      mockSupabase.from
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runSelectChain)
        .mockReturnValueOnce(threadUpsertChain)

      // Mock: agent status check returns CREATING
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'CREATING' }),
      } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should reuse existing thread when status is CREATING
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'existing-run-id',
        status: 'polling',
        cursorAgentId: 'creating-agent-id',
        isContinuing: true,
      })
    })

    it('should create new agent when existing run status is not polling', async () => {
      const body = {
        message: 'Test message',
        repoFullName: 'test/repo',
        defaultBranch: 'main',
        conversationId: 'conv-123',
        projectId: 'proj-456',
      }

      const threadChain = {
        select: vi.fn(() => threadChain),
        eq: vi.fn(() => threadChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { cursor_agent_id: 'existing-agent-id' },
          error: null,
        }),
      }

      const runSelectChain = {
        select: vi.fn(() => runSelectChain),
        eq: vi.fn(() => runSelectChain),
        order: vi.fn(() => runSelectChain),
        limit: vi.fn(() => runSelectChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'existing-run-id', status: 'failed' }, // Not 'polling'
          error: null,
        }),
      }

      const runInsertChain = {
        insert: vi.fn(() => runInsertChain),
        select: vi.fn(() => runInsertChain),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { run_id: 'new-run-id' },
          error: null,
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
        .mockReturnValueOnce(threadChain)
        .mockReturnValueOnce(runSelectChain)
        .mockReturnValueOnce(runInsertChain)
        .mockReturnValueOnce(runUpdateChain)
        .mockReturnValueOnce(threadUpsertChain)

      // Mock: agent status check returns RUNNING
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'RUNNING' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
        } as Response)

      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(body))
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Should create new agent when existing run status is not 'polling'
      expect(responseStatus).toBe(200)
      expect(responseBody).toMatchObject({
        runId: 'new-run-id',
        status: 'polling',
        cursorAgentId: 'new-agent-id',
      })
    })
  })
})

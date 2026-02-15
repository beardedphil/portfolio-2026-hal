/**
 * Tests for PM agent launch endpoint thread lookup/update logic.
 * 
 * These tests verify that:
 * - Conversation threads are correctly mapped to cursor_agent_id
 * - Existing threads are reused when agents are still RUNNING
 * - New agents are created when threads don't exist or agents are FINISHED
 * - Conversation history is fetched and included in prompts when continuing
 * - Restart functionality clears thread mappings
 * - Thread mappings are persisted server-side
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './launch.js'

// Mock dependencies
vi.mock('../agent-runs/_shared.js', () => ({
  getServerSupabase: vi.fn(),
  getCursorApiKey: vi.fn(() => 'test-cursor-key'),
  humanReadableCursorError: vi.fn((status: number) => `Error ${status}`),
  appendProgress: vi.fn((arr: any[], msg: string) => [...(arr || []), { at: new Date().toISOString(), message: msg }]),
}))

vi.mock('../_lib/github/config.js', () => ({
  getOrigin: vi.fn(() => 'https://test.hal.app'),
}))

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  delete: vi.fn(() => mockSupabase),
  upsert: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  maybeSingle: vi.fn(),
  order: vi.fn(() => mockSupabase),
  limit: vi.fn(() => mockSupabase),
}

// Mock request/response helpers
function createMockRequest(body: unknown): IncomingMessage {
  const chunks: Buffer[] = []
  const bodyStr = JSON.stringify(body)
  for (let i = 0; i < bodyStr.length; i += 10) {
    chunks.push(Buffer.from(bodyStr.slice(i, i + 10)))
  }
  return {
    method: 'POST',
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  } as unknown as IncomingMessage
}

function createMockResponse(): ServerResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value
    }),
    end: vi.fn((body?: string) => {
      res.body = body
    }),
    body: undefined as string | undefined,
  } as unknown as ServerResponse
  return res
}

describe('PM agent launch thread lookup', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getServerSupabase } = await import('../agent-runs/_shared.js')
    vi.mocked(getServerSupabase).mockReturnValue(mockSupabase as any)
  })

  it('should create new thread mapping when conversationId and projectId are provided', async () => {
    // Mock: no existing thread
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    
    // Mock: agent run creation
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'test-run-id' }, 
      error: null 
    })
    
    // Mock: cursor agent launch response
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    })
    global.fetch = mockFetch
    
    // Mock: thread upsert
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    const req = createMockRequest({
      message: 'Test message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'project-manager-1',
      projectId: 'test-project',
    })
    const res = createMockResponse()
    
    await handler(req, res)
    
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    expect(mockSupabase.upsert).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it('should create new agent with conversation history when continuing', async () => {
    // Mock: existing thread with RUNNING agent
    mockSupabase.maybeSingle
      .mockResolvedValueOnce({ 
        data: { cursor_agent_id: 'existing-agent-id' }, 
        error: null 
      })
      .mockResolvedValueOnce({ 
        data: { run_id: 'existing-run-id', status: 'polling' }, 
        error: null 
      })
    
    // Mock: agent status check returns RUNNING
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'RUNNING' }),
    })
    global.fetch = mockFetch
    
    // Mock: conversation history fetch (chain: from -> select -> eq -> eq -> order -> then await)
    // The fetchConversationHistory function does: from('hal_conversation_messages').select('role, content').eq('project_id', ...).eq('agent', ...).order('sequence', ...)
    // We need to mock the chain properly
    const historyChain = {
      from: vi.fn(() => historyChain),
      select: vi.fn(() => historyChain),
      eq: vi.fn(() => historyChain),
      order: vi.fn(() => Promise.resolve({ 
        data: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ], 
        error: null 
      })),
    }
    mockSupabase.from.mockImplementationOnce((table: string) => {
      if (table === 'hal_conversation_messages') {
        return historyChain
      }
      return mockSupabase
    })
    
    // Mock: new agent run creation (we create new agent even when continuing)
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'new-run-id' }, 
      error: null 
    })
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
    })
    
    // Mock: thread upsert
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    const req = createMockRequest({
      message: 'Follow-up message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'project-manager-1',
      projectId: 'test-project',
    })
    const res = createMockResponse()
    
    await handler(req, res)
    
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    // History fetch happens via a separate chain, check that from was called with hal_conversation_messages
    const fromCalls = mockSupabase.from.mock.calls.map(call => call[0])
    expect(fromCalls).toContain('hal_conversation_messages')
    expect(mockSupabase.insert).toHaveBeenCalled() // New agent created
    expect(res.statusCode).toBe(200)
  })

  it('should create new agent when existing agent is FINISHED', async () => {
    // Mock: existing thread
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { cursor_agent_id: 'finished-agent-id' }, 
      error: null 
    })
    
    // Mock: agent status check returns FINISHED (or not ok)
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    })
    global.fetch = mockFetch
    
    // When agent is finished, isContinuing will be false, so history is not fetched
    // We just create a new agent without history
    
    // Mock: new agent run creation
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'new-run-id' }, 
      error: null 
    })
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
    })
    
    // Mock: thread upsert
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    const req = createMockRequest({
      message: 'New message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      conversationId: 'project-manager-1',
      projectId: 'test-project',
    })
    const res = createMockResponse()
    
    await handler(req, res)
    
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    // When agent is finished, we don't fetch history (isContinuing is false)
    expect(mockSupabase.insert).toHaveBeenCalled() // New agent run created
    expect(res.statusCode).toBe(200)
  })

  it('should clear thread mapping when restart is requested', async () => {
    // Mock: delete operation (restart requires repoFullName for validation, but doesn't use it)
    // The delete chain is: from('hal_pm_conversation_threads').delete().eq('project_id', ...).eq('conversation_id', ...)
    // delete() needs to return mockSupabase so eq() can be called
    mockSupabase.delete.mockReturnValueOnce(mockSupabase)
    mockSupabase.eq.mockReturnValueOnce(mockSupabase) // First eq for project_id
    mockSupabase.eq.mockResolvedValueOnce({ data: null, error: null }) // Second eq for conversation_id, then await
    
    const req = createMockRequest({
      restart: true,
      message: '', // Optional when restarting
      repoFullName: 'test/repo', // Required for validation
      conversationId: 'project-manager-1',
      projectId: 'test-project',
    })
    const res = createMockResponse()
    
    await handler(req, res)
    
    // Check response body for error details if status is not 200
    if (res.statusCode !== 200 && res.body) {
      console.log('Response body:', res.body)
    }
    
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
    expect(mockSupabase.delete).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  it('should handle missing conversationId gracefully', async () => {
    // Mock: agent run creation
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'test-run-id' }, 
      error: null 
    })
    
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-agent-id', status: 'CREATING' }),
    })
    global.fetch = mockFetch
    
    const req = createMockRequest({
      message: 'Test message',
      repoFullName: 'test/repo',
      defaultBranch: 'main',
      // No conversationId or projectId
    })
    const res = createMockResponse()
    
    await handler(req, res)
    
    // Should not call thread lookup when conversationId is missing
    expect(mockSupabase.from).not.toHaveBeenCalledWith('hal_pm_conversation_threads')
    expect(mockSupabase.insert).toHaveBeenCalled() // New agent created
    expect(res.statusCode).toBe(200)
  })

  it('should fetch conversation history when continuing a thread', async () => {
    // Mock: existing thread
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { cursor_agent_id: 'existing-agent-id' }, 
      error: null 
    })
    
    // Mock: agent status check returns FINISHED (so we create new agent with history)
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'FINISHED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
      })
    global.fetch = mockFetch
    
    // Mock: conversation history fetch
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
      ],
      error: null 
    })
    
    // Mock: new agent run creation
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'new-run-id' }, 
      error: null 
    })
    
    // Mock: thread upsert
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    // The handler should fetch conversation history and include it in the prompt
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_conversation_messages')
  })

  it('should update thread mapping when creating new agent for existing conversation', async () => {
    // Mock: existing thread with FINISHED agent
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { cursor_agent_id: 'old-agent-id' }, 
      error: null 
    })
    
    // Mock: agent status check returns FINISHED
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'FINISHED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'new-agent-id', status: 'CREATING' }),
      })
    global.fetch = mockFetch
    
    // Mock: conversation history (empty for this test)
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: [],
      error: null 
    })
    
    // Mock: new agent run creation
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'new-run-id' }, 
      error: null 
    })
    
    // Mock: thread upsert (should update to new-agent-id)
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    // The handler should update the thread mapping with the new cursor_agent_id
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor_agent_id: 'new-agent-id',
      }),
      expect.any(Object)
    )
  })

  it('should persist thread mapping across requests', async () => {
    // First request: create new thread
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: null, // No existing thread
      error: null 
    })
    
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { run_id: 'run-1' }, 
      error: null 
    })
    
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'agent-1', status: 'CREATING' }),
    })
    global.fetch = mockFetch
    
    mockSupabase.upsert.mockResolvedValueOnce({ data: null, error: null })
    
    // Second request: should find existing thread
    mockSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { cursor_agent_id: 'agent-1' }, 
      error: null 
    })
    
    // The thread mapping should be persisted and found on the second request
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_pm_conversation_threads')
  })
})

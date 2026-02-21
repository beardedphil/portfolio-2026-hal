import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPmAgent } from '../projectManager.js'
import type { PmAgentConfig } from './contextBuilding.js'
import { generateFallbackReply, isAbortError } from './replyGeneration.js'
import type { ToolCallRecord } from '../projectManager.js'
import { streamText } from 'ai'

// Mock the context building module
vi.mock('./contextBuilding.js', async () => {
  const actual = await vi.importActual('./contextBuilding.js')
  return {
    ...actual,
    buildContextPack: vi.fn(),
  }
})

// Mock OpenAI SDK
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn(() => ({
      streamText: vi.fn(),
    })),
  })),
}))

// Mock AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(),
  tool: vi.fn((config) => config),
  jsonSchema: vi.fn((schema) => schema),
}))

// Mock the tools module
vi.mock('../tools.js', () => ({
  readFile: vi.fn(),
  searchFiles: vi.fn(),
  listDirectory: vi.fn(),
}))

// Mock the extracted modules
vi.mock('./toolDefinitions.js', () => ({
  createTools: vi.fn(() => ({})),
}))

vi.mock('./promptBuilding.js', () => ({
  buildPrompt: vi.fn(() => ({
    prompt: 'test prompt',
    fullPromptText: 'full prompt text',
  })),
}))

vi.mock('./toolExecution.js', () => ({
  executeTools: vi.fn(),
}))

describe('runPmAgent', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  describe('context pack building error handling', () => {
    it('returns error result when context pack building fails', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      vi.mocked(buildContextPack).mockRejectedValue(new Error('Context build failed'))

      const result = await runPmAgent('test message', baseConfig)

      expect(result.error).toBe('Context build failed')
      expect(result.errorPhase).toBe('context-pack')
      expect(result.reply).toBe('')
      expect(result.toolCalls).toEqual([])
    })

    it('handles non-Error exceptions in context pack building', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      vi.mocked(buildContextPack).mockRejectedValue('String error')

      const result = await runPmAgent('test message', baseConfig)

      expect(result.error).toBe('String error')
      expect(result.errorPhase).toBe('context-pack')
    })
  })

  describe('abort error detection', () => {
    it('detects abort when abortSignal is aborted', () => {
      const abortController = new AbortController()
      abortController.abort()

      const err = new Error('Test error')
      expect(isAbortError(err, abortController.signal)).toBe(true)
    })

    it('detects abort errors with AbortError name', () => {
      const err = { name: 'AbortError' }
      expect(isAbortError(err)).toBe(true)
    })

    it('detects abort errors in error message', () => {
      const err = new Error('Request was aborted')
      expect(isAbortError(err)).toBe(true)
    })

    it('returns false for non-abort errors', () => {
      const err = new Error('Regular error')
      expect(isAbortError(err)).toBe(false)
    })

    it('propagates abort errors when abortSignal is aborted', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      vi.mocked(buildContextPack).mockResolvedValue('context pack')

      const abortController = new AbortController()
      abortController.abort()

      const config = {
        ...baseConfig,
        abortSignal: abortController.signal,
      }

      // Mock streamText to throw abort error
      vi.mocked(streamText).mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      await expect(runPmAgent('test message', config)).rejects.toThrow()
    })
  })

  describe('reply generation fallback', () => {
    it('generates fallback reply when create_ticket succeeds', () => {
      const toolCalls: ToolCallRecord[] = [
        {
          name: 'create_ticket',
          input: { title: 'Test Ticket', body_md: 'Test body' },
          output: {
            success: true,
            id: '0123',
            filename: '0123-test-ticket.md',
            filePath: 'supabase:tickets/HAL-0123',
            ready: false,
            missingItems: ['Acceptance criteria'],
          },
        },
      ]

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toContain('HAL-0123')
      expect(reply).toContain('created ticket')
      expect(reply).toContain('not yet ready')
      expect(reply).toContain('Acceptance criteria')
    })

    it('generates fallback reply when update_ticket_body succeeds', () => {
      const toolCalls: ToolCallRecord[] = [
        {
          name: 'update_ticket_body',
          input: { ticket_id: 'HAL-0456', body_md: 'Updated body' },
          output: {
            success: true,
            ticketId: 'HAL-0456',
            ready: true,
          },
        },
      ]

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toContain('HAL-0456')
      expect(reply).toContain('updated')
    })

    it('generates error reply when create_ticket fails with placeholders', () => {
      const toolCalls: ToolCallRecord[] = [
        {
          name: 'create_ticket',
          input: { title: 'Test', body_md: 'Body with <placeholder>' },
          output: {
            success: false,
            error: 'Ticket creation rejected: unresolved template placeholder tokens detected.',
            detectedPlaceholders: ['<placeholder>'],
          },
        },
      ]

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toContain('rejected')
      expect(reply).toContain('placeholder')
      expect(reply).toContain('<placeholder>')
    })

    it('generates reply for kanban_move_ticket_to_todo', () => {
      const toolCalls: ToolCallRecord[] = [
        {
          name: 'kanban_move_ticket_to_todo',
          input: { ticket_id: 'HAL-0789', position: 'bottom' },
          output: {
            success: true,
            ticketId: 'HAL-0789',
            fromColumn: 'col-unassigned',
            toColumn: 'col-todo',
          },
        },
      ]

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toContain('HAL-0789')
      expect(reply).toContain('moved')
      expect(reply).toContain('To Do')
    })

    it('generates reply for list_tickets_by_column', () => {
      const toolCalls: ToolCallRecord[] = [
        {
          name: 'list_tickets_by_column',
          input: { column_id: 'col-todo' },
          output: {
            success: true,
            column_id: 'col-todo',
            tickets: [
              { id: 'HAL-0001', title: 'First Ticket', column: 'col-todo' },
              { id: 'HAL-0002', title: 'Second Ticket', column: 'col-todo' },
            ],
            count: 2,
          },
        },
      ]

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toContain('col-todo')
      expect(reply).toContain('HAL-0001')
      expect(reply).toContain('HAL-0002')
      expect(reply).toContain('First Ticket')
    })

    it('returns empty string when no matching tool calls', () => {
      const toolCalls: ToolCallRecord[] = []

      const reply = generateFallbackReply(toolCalls)

      expect(reply).toBe('')
    })
  })

  describe('tool call recording', () => {
    it('records tool calls in result', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      const { executeTools } = await import('./toolExecution.js')
      
      vi.mocked(buildContextPack).mockResolvedValue('context pack')
      vi.mocked(executeTools).mockResolvedValue({
        reply: 'test reply',
        toolCalls: [],
        outboundRequest: {},
      })

      const result = await runPmAgent('test message', baseConfig)

      expect(result.toolCalls).toBeDefined()
      expect(Array.isArray(result.toolCalls)).toBe(true)
      expect(result.reply).toBe('test reply')
    })
  })

  describe('tool creation and execution flow', () => {
    it('creates tools using extracted module', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      const { createTools } = await import('./toolDefinitions.js')
      const { executeTools } = await import('./toolExecution.js')
      
      vi.mocked(buildContextPack).mockResolvedValue('context pack')
      vi.mocked(createTools).mockReturnValue({ test_tool: {} })
      vi.mocked(executeTools).mockResolvedValue({
        reply: 'reply',
        toolCalls: [],
        outboundRequest: {},
      })

      await runPmAgent('test message', baseConfig)

      expect(createTools).toHaveBeenCalled()
      const createToolsCall = vi.mocked(createTools).mock.calls[0][0]
      expect(createToolsCall).toHaveProperty('toolCalls')
      expect(createToolsCall).toHaveProperty('halFetchJson')
      expect(createToolsCall).toHaveProperty('config')
      expect(createToolsCall).toHaveProperty('isAbortError')
    })

    it('builds prompt using extracted module', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      const { buildPrompt } = await import('./promptBuilding.js')
      const { executeTools } = await import('./toolExecution.js')
      
      vi.mocked(buildContextPack).mockResolvedValue('context pack')
      vi.mocked(buildPrompt).mockReturnValue({
        prompt: 'built prompt',
        fullPromptText: 'full prompt',
      })
      vi.mocked(executeTools).mockResolvedValue({
        reply: 'reply',
        toolCalls: [],
        outboundRequest: {},
      })

      await runPmAgent('test message', baseConfig)

      expect(buildPrompt).toHaveBeenCalled()
      const buildPromptCall = vi.mocked(buildPrompt).mock.calls[0][0]
      expect(buildPromptCall).toHaveProperty('contextPack', 'context pack')
      expect(buildPromptCall).toHaveProperty('systemInstructions')
      expect(buildPromptCall).toHaveProperty('openaiModel')
    })

    it('executes tools using extracted module', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      const { executeTools } = await import('./toolExecution.js')
      
      vi.mocked(buildContextPack).mockResolvedValue('context pack')
      vi.mocked(executeTools).mockResolvedValue({
        reply: 'executed reply',
        toolCalls: [{ name: 'test_tool', input: {}, output: {} }],
        outboundRequest: { test: 'request' },
        responseId: 'test-response-id',
      })

      const result = await runPmAgent('test message', baseConfig)

      expect(executeTools).toHaveBeenCalled()
      expect(result.reply).toBe('executed reply')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.outboundRequest).toEqual({ test: 'request' })
      expect(result.responseId).toBe('test-response-id')
    })

    it('includes repo usage and prompt text in result', async () => {
      const { buildContextPack } = await import('./contextBuilding.js')
      const { executeTools } = await import('./toolExecution.js')
      
      vi.mocked(buildContextPack).mockResolvedValue('context pack')
      vi.mocked(executeTools).mockResolvedValue({
        reply: 'reply',
        toolCalls: [],
        outboundRequest: {},
      })

      const config = {
        ...baseConfig,
        repoFullName: 'test/repo',
        githubReadFile: vi.fn(),
      }

      const result = await runPmAgent('test message', config)

      expect(result).toHaveProperty('_repoUsage')
      expect(result).toHaveProperty('promptText')
    })
  })
})

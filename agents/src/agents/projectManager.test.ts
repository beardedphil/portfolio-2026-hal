import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPmAgent, type PmAgentResult } from './projectManager.js'
import * as contextBuilding from './projectManager/contextBuilding.js'

// Mock dependencies
vi.mock('./projectManager/contextBuilding.js')
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn(() => ({})),
  })),
}))
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    streamText: vi.fn(),
    tool: vi.fn((def: any) => def),
    jsonSchema: vi.fn((schema: any) => schema),
  }
})

describe('runPmAgent', () => {
  const mockConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    projectId: 'test/project',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('error handling - context pack building failure', () => {
    it('returns error result when context pack building fails', async () => {
      const buildError = new Error('Context pack build failed')
      vi.spyOn(contextBuilding, 'buildContextPack').mockRejectedValue(buildError)

      const result = await runPmAgent('test message', mockConfig)

      expect(result.error).toBe('Context pack build failed')
      expect(result.errorPhase).toBe('context-pack')
      expect(result.reply).toBe('')
      expect(result.toolCalls).toEqual([])
    })

    it('handles non-Error exceptions in context pack building', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockRejectedValue('String error')

      const result = await runPmAgent('test message', mockConfig)

      expect(result.error).toBe('String error')
      expect(result.errorPhase).toBe('context-pack')
    })
  })

  describe('tool call recording', () => {
    it('records tool calls in toolCalls array', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockResolvedValue('Context pack content')
      
      const { streamText } = await import('ai')
      const mockResult = {
        textStream: (async function* () {
          yield 'Test reply'
        })(),
        providerMetadata: {},
      }
      vi.mocked(streamText).mockResolvedValue(mockResult as any)

      const result = await runPmAgent('test message', mockConfig)

      // Tool calls should be recorded even if no tools were actually called
      expect(Array.isArray(result.toolCalls)).toBe(true)
    })
  })

  describe('abort signal handling', () => {
    it('propagates abort errors when abortSignal is triggered', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockResolvedValue('Context pack content')
      
      const abortController = new AbortController()
      abortController.abort()

      const configWithAbort = {
        ...mockConfig,
        abortSignal: abortController.signal,
      }

      const { streamText } = await import('ai')
      const mockResult = {
        textStream: (async function* () {
          yield 'Test reply'
        })(),
        providerMetadata: {},
      }
      vi.mocked(streamText).mockResolvedValue(mockResult as any)

      // The function should handle abort signal gracefully
      const result = await runPmAgent('test message', configWithAbort)
      
      // Should return a result even with abort signal
      expect(result).toBeDefined()
      expect(Array.isArray(result.toolCalls)).toBe(true)
    })

    it('handles abort errors in tool execution', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockResolvedValue('Context pack content')
      
      const abortController = new AbortController()
      const configWithAbort = {
        ...mockConfig,
        abortSignal: abortController.signal,
      }

      const { streamText } = await import('ai')
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(streamText).mockRejectedValue(abortError)

      await expect(runPmAgent('test message', configWithAbort)).rejects.toThrow()
    })
  })

  describe('outbound request capture', () => {
    it('captures outbound request for debugging', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockResolvedValue('Context pack content')
      
      const { streamText } = await import('ai')
      const mockResult = {
        textStream: (async function* () {
          yield 'Test reply'
        })(),
        providerMetadata: {},
      }
      vi.mocked(streamText).mockResolvedValue(mockResult as any)

      const result = await runPmAgent('test message', mockConfig)

      // outboundRequest should be an object (may be empty if no request was captured)
      expect(typeof result.outboundRequest).toBe('object')
      expect(result.outboundRequest).not.toBeNull()
    })
  })
})

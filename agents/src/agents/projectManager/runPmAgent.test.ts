import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPmAgent } from '../projectManager.js'
import { buildContextPack } from './contextBuilding.js'

// Mock dependencies
vi.mock('./contextBuilding.js', () => ({
  buildContextPack: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn(() => 'mock-model'),
  })),
}))

vi.mock('ai', () => ({
  streamText: vi.fn(),
  jsonSchema: vi.fn((schema) => schema),
  tool: vi.fn((config) => ({
    ...config,
    execute: config.execute || (async () => ({})),
  })),
}))

describe('runPmAgent', () => {
  const mockConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    projectId: 'test-project',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global fetch
    global.fetch = vi.fn()
    // Mock process.env
    process.env.HAL_API_BASE_URL = 'https://test-hal.example.com'
  })

  describe('context-pack error handling', () => {
    it('returns error result when buildContextPack throws', async () => {
      const errorMessage = 'Context pack build failed'
      vi.mocked(buildContextPack).mockRejectedValue(new Error(errorMessage))

      const result = await runPmAgent('test message', mockConfig)

      expect(result.error).toBe(errorMessage)
      expect(result.errorPhase).toBe('context-pack')
      expect(result.reply).toBe('')
      expect(result.toolCalls).toEqual([])
    })

    it('handles non-Error exceptions in context-pack phase', async () => {
      vi.mocked(buildContextPack).mockRejectedValue('String error')

      const result = await runPmAgent('test message', mockConfig)

      expect(result.error).toBe('String error')
      expect(result.errorPhase).toBe('context-pack')
    })

    it('returns empty outboundRequest when context-pack fails', async () => {
      vi.mocked(buildContextPack).mockRejectedValue(new Error('Test error'))

      const result = await runPmAgent('test message', mockConfig)

      expect(result.outboundRequest).toEqual({})
    })
  })
})

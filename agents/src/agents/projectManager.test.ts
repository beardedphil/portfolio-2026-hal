import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPmAgent, type PmAgentResult } from './projectManager.js'
import * as contextBuilding from './projectManager/contextBuilding.js'
import * as replyGeneration from './projectManager/replyGeneration.js'

// Mock dependencies
vi.mock('./projectManager/contextBuilding.js')
vi.mock('./projectManager/replyGeneration.js')

describe('runPmAgent', () => {
  const baseConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock buildContextPack to return a simple context pack
    vi.spyOn(contextBuilding, 'buildContextPack').mockResolvedValue('Mock context pack')
    // Mock isAbortError
    vi.spyOn(replyGeneration, 'isAbortError').mockReturnValue(false)
  })

  describe('error handling', () => {
    it('handles context pack building errors gracefully', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockRejectedValue(new Error('Context build failed'))

      const result = await runPmAgent('test message', baseConfig)

      expect(result.toolCalls).toEqual([])
      expect(result.error).toBe('Context build failed')
      expect(result.errorPhase).toBe('context-pack')
    })

    it('handles abort errors during context pack building', async () => {
      const abortController = new AbortController()
      abortController.abort()

      // Abort errors during context pack building are caught and returned
      vi.spyOn(replyGeneration, 'isAbortError').mockReturnValue(false)
      vi.spyOn(contextBuilding, 'buildContextPack').mockRejectedValue(new Error('Aborted'))

      const result = await runPmAgent('test message', {
        ...baseConfig,
        abortSignal: abortController.signal,
      })

      expect(result.error).toBe('Aborted')
      expect(result.errorPhase).toBe('context-pack')
    })

    it('handles non-abort errors gracefully', async () => {
      vi.spyOn(contextBuilding, 'buildContextPack').mockRejectedValue(new Error('Network error'))

      const result = await runPmAgent('test message', baseConfig)

      expect(result.error).toBe('Network error')
      expect(result.errorPhase).toBe('context-pack')
      expect(result.reply).toBe('')
    })
  })

  describe('result structure', () => {
    it('includes prompt text in result for display', () => {
      // Test that the result type includes promptText
      const result: PmAgentResult = {
        reply: 'Test reply',
        toolCalls: [],
        outboundRequest: {},
        promptText: '## System Instructions\n\n...\n\n## User Prompt\n\nTest context pack',
      }

      expect(result.promptText).toBeDefined()
      expect(result.promptText).toContain('System Instructions')
      expect(result.promptText).toContain('User Prompt')
    })

    it('includes repo usage tracking in result type', () => {
      const result: PmAgentResult = {
        reply: '',
        toolCalls: [],
        outboundRequest: {},
        _repoUsage: [{ tool: 'read_file', usedGitHub: true, path: 'test.ts' }],
      }

      expect(result._repoUsage).toBeDefined()
      expect(Array.isArray(result._repoUsage)).toBe(true)
    })
  })
})

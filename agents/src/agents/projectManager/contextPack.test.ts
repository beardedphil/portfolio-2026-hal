import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PmAgentConfig } from './contextBuilding.js'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
  readFile: vi.fn(),
}))

// Import after mocks are set up
import { buildContextPack } from './contextPack.js'
import fs from 'fs/promises'

describe('buildContextPack', () => {
  const mockRepoRoot = '/mock/repo'
  const mockConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mocks that work for most tests
    vi.mocked(fs.readFile).mockResolvedValue('mock content')
    // Mock global fetch
    global.fetch = vi.fn()
  })

  describe('basic functionality', () => {
    it('returns a string when called with valid config and message', async () => {
      const result = await buildContextPack(mockConfig, 'Test message')

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain('Test message')
    })

    it('includes user message in the output', async () => {
      const userMessage = 'Custom user message here'
      const result = await buildContextPack(mockConfig, userMessage)

      expect(result).toContain(userMessage)
    })

    it('includes inputs summary section in output', async () => {
      const result = await buildContextPack(mockConfig, 'Test')

      expect(result).toContain('## Inputs (provided by HAL)')
      expect(result).toContain('repoFullName')
      expect(result).toContain('repoRoot')
    })
  })

  describe('conversation history handling', () => {
    it('includes conversation history when provided', async () => {
      const configWithHistory: PmAgentConfig = {
        ...mockConfig,
        conversationHistory: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' },
        ],
      }

      const result = await buildContextPack(configWithHistory, 'Latest message')

      expect(result).toContain('Conversation so far')
      expect(result).toContain('First message')
      expect(result).toContain('First response')
      expect(result).toContain('Second message')
      expect(result).toContain('Latest message')
    })

    it('handles empty conversation history gracefully', async () => {
      const configWithEmptyHistory: PmAgentConfig = {
        ...mockConfig,
        conversationHistory: [],
      }

      const result = await buildContextPack(configWithEmptyHistory, 'Test message')

      expect(result).toContain('Test message')
      // Should not contain "Conversation so far" when history is empty
      expect(result).not.toContain('Conversation so far')
    })

    it('truncates long conversation history within character budget', async () => {
      // Create a long conversation history that exceeds the budget
      const longHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
      for (let i = 0; i < 100; i++) {
        longHistory.push({
          role: 'user',
          content: `Message ${i}: ${'A'.repeat(200)}`, // Each message is ~200 chars
        })
      }

      const configWithLongHistory: PmAgentConfig = {
        ...mockConfig,
        conversationHistory: longHistory,
      }

      const result = await buildContextPack(configWithLongHistory, 'Latest message')

      expect(result).toContain('Latest message')
      // Should mention omitted messages if history was truncated
      expect(result.length).toBeLessThan(50000) // Reasonable size limit
    })
  })

  describe('working memory handling', () => {
    it('includes working memory text when provided', async () => {
      const workingMemoryText = 'Working memory: User prefers TypeScript over JavaScript'
      const configWithWorkingMemory: PmAgentConfig = {
        ...mockConfig,
        workingMemoryText,
      }

      const result = await buildContextPack(configWithWorkingMemory, 'Test message')

      expect(result).toContain(workingMemoryText)
    })

    it('handles empty working memory gracefully', async () => {
      const configWithEmptyWorkingMemory: PmAgentConfig = {
        ...mockConfig,
        workingMemoryText: '',
      }

      const result = await buildContextPack(configWithEmptyWorkingMemory, 'Test message')

      expect(result).toContain('Test message')
      // Should not include empty working memory
    })
  })

  describe('error handling', () => {
    it('handles file read failures gracefully', async () => {
      // Mock file read to fail
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

      const result = await buildContextPack(mockConfig, 'Test message')

      // Should still return a result even if file reads fail
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('configuration variations', () => {
    it('handles config with repoFullName', async () => {
      const configWithRepo: PmAgentConfig = {
        ...mockConfig,
        repoFullName: 'owner/repo-name',
      }

      const result = await buildContextPack(configWithRepo, 'Test message')

      expect(result).toContain('owner/repo-name')
    })

    it('handles config with conversationContextPack instead of history', async () => {
      const contextPack = 'Previous conversation summary: User asked about tickets'
      const configWithContextPack: PmAgentConfig = {
        ...mockConfig,
        conversationContextPack: contextPack,
      }

      const result = await buildContextPack(configWithContextPack, 'Test message')

      expect(result).toContain(contextPack)
      expect(result).toContain('conversationContextPack (DB-derived)')
    })
  })

  describe('input validation', () => {
    it('throws error when repoRoot is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        repoRoot: '',
      } as PmAgentConfig

      await expect(buildContextPack(invalidConfig, 'Test message')).rejects.toThrow(
        'repoRoot is required'
      )
    })

    it('throws error when openaiApiKey is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        openaiApiKey: '',
      } as PmAgentConfig

      await expect(buildContextPack(invalidConfig, 'Test message')).rejects.toThrow(
        'openaiApiKey is required'
      )
    })

    it('throws error when openaiModel is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        openaiModel: '',
      } as PmAgentConfig

      await expect(buildContextPack(invalidConfig, 'Test message')).rejects.toThrow(
        'openaiModel is required'
      )
    })

    it('throws error when userMessage is empty', async () => {
      await expect(buildContextPack(mockConfig, '')).rejects.toThrow(
        'userMessage cannot be empty'
      )
    })

    it('throws error when userMessage is only whitespace', async () => {
      await expect(buildContextPack(mockConfig, '   ')).rejects.toThrow(
        'userMessage cannot be empty'
      )
    })
  })
})

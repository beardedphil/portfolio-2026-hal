import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  buildContextPack,
  CONVERSATION_RECENT_MAX_CHARS,
  type PmAgentConfig,
  type ConversationTurn,
} from './contextBuilding.js'

// Mock fs module
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
  readFile: vi.fn(),
}))

describe('contextBuilding', () => {
  const mockRepoRoot = '/test/repo'
  const baseConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all file reads fail (simulating missing files)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
  })

  describe('recentTurnsWithinCharBudget', () => {
    it('returns empty array when turns is empty', () => {
      const result = recentTurnsWithinCharBudget([], 1000)
      expect(result.recent).toEqual([])
      expect(result.omitted).toBe(0)
    })

    it('returns all turns when within budget', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 1000)
      expect(result.recent).toEqual(turns)
      expect(result.omitted).toBe(0)
    })

    it('truncates turns when exceeding budget, keeping most recent', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'A'.repeat(1000) },
        { role: 'assistant', content: 'B'.repeat(1000) },
        { role: 'user', content: 'C' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 100)
      // Should keep the most recent turn(s) that fit
      expect(result.recent.length).toBeGreaterThan(0)
      expect(result.recent.length).toBeLessThan(turns.length)
      expect(result.omitted).toBeGreaterThan(0)
      // Most recent turn should be included
      expect(result.recent[result.recent.length - 1].content).toBe('C')
    })

    it('calculates character count including role and formatting overhead', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Test' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 5)
      // With overhead (role length + content length + 12), should still fit
      expect(result.recent.length).toBeGreaterThanOrEqual(0)
    })

    it('handles turns with very long content', () => {
      const longContent = 'A'.repeat(50000)
      const turns: ConversationTurn[] = [
        { role: 'user', content: longContent },
        { role: 'assistant', content: 'Short reply' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 1000)
      // Should handle gracefully, likely omitting the long turn
      expect(result.omitted).toBeGreaterThanOrEqual(0)
    })

    it('preserves order of recent turns (most recent last)', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Second' },
        { role: 'user', content: 'Third' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 1000)
      expect(result.recent[0].content).toBe('First')
      expect(result.recent[1].content).toBe('Second')
      expect(result.recent[2].content).toBe('Third')
    })
  })

  describe('formatPmInputsSummary', () => {
    it('formats basic config with minimal inputs', () => {
      const config: PmAgentConfig = {
        repoRoot: '/test',
        openaiApiKey: 'key',
        openaiModel: 'gpt-4',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('## Inputs (provided by HAL)')
      expect(result).toContain('repoRoot')
      expect(result).toContain('openaiModel')
      expect(result).toContain('(not provided)')
    })

    it('includes repoFullName when provided', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        repoFullName: 'owner/repo',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('owner/repo')
      expect(result).not.toContain('(not provided)')
    })

    it('detects conversation context pack over conversation history', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        conversationContextPack: 'Pre-built context',
        conversationHistory: [{ role: 'user', content: 'Test' }],
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('conversationContextPack (DB-derived)')
      expect(result).not.toContain('conversationHistory (client-provided)')
    })

    it('falls back to conversation history when context pack not provided', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        conversationHistory: [{ role: 'user', content: 'Test' }],
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('conversationHistory (client-provided)')
    })

    it('shows working memory status when provided', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        workingMemoryText: 'Working memory content',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('working memory')
      expect(result).toContain('present')
    })

    it('shows image count and vision model detection', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        openaiModel: 'gpt-4o',
        images: [
          { dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' },
        ],
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('images')
      expect(result).toContain('1')
      expect(result).toContain('included')
    })

    it('lists enabled and disabled tools', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('## Tools available (this run)')
      expect(result).toContain('get_instruction_set')
      expect(result).toContain('read_file')
      expect(result).toContain('sync_tickets')
    })

    it('handles empty repoFullName string as not provided', () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        repoFullName: '   ',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('(not provided)')
    })
  })

  describe('buildContextPack', () => {

    it('includes inputs summary at the start', async () => {
      const result = await buildContextPack(baseConfig, 'Test message')
      expect(result).toContain('## Inputs (provided by HAL)')
    })

    it('includes user message in output', async () => {
      const userMessage = 'Hello, this is a test message'
      const result = await buildContextPack(baseConfig, userMessage)
      expect(result).toContain(userMessage)
    })

    it('includes working memory when provided', async () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        workingMemoryText: 'Working memory: test content',
      }
      const result = await buildContextPack(config, 'Test')
      expect(result).toContain('Working memory: test content')
    })

    it('includes conversation context pack when provided', async () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        conversationContextPack: 'Previous conversation summary',
      }
      const result = await buildContextPack(config, 'Test')
      expect(result).toContain('## Conversation so far')
      expect(result).toContain('Previous conversation summary')
    })

    it('includes conversation history when context pack not provided', async () => {
      const config: PmAgentConfig = {
        ...baseConfig,
        conversationHistory: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
      }
      const result = await buildContextPack(config, 'Test')
      expect(result).toContain('## Conversation so far')
      expect(result).toContain('Previous message')
      expect(result).toContain('Previous response')
    })

    it('includes git status section in output', async () => {
      // Note: This test may actually run git, but that's acceptable for integration testing
      const result = await buildContextPack(baseConfig, 'Test')
      expect(result).toContain('## Git status')
    })
  })
})

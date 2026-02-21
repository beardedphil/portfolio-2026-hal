import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs/promises'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  buildContextPack,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding.js'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}))

describe('contextBuilding', () => {
  const mockRepoRoot = '/test/repo'
  const mockConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: make all file reads fail (simulates missing local files)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
  })

  describe('recentTurnsWithinCharBudget', () => {
    it('returns empty array when turns array is empty', () => {
      const result = recentTurnsWithinCharBudget([], 1000)
      expect(result.recent).toEqual([])
      expect(result.omitted).toBe(0)
    })

    it('includes all turns when total length is within budget', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]
      const result = recentTurnsWithinCharBudget(turns, 1000)
      expect(result.recent).toEqual(turns)
      expect(result.omitted).toBe(0)
    })

    it('truncates from the beginning when budget is exceeded', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Second response' },
      ]
      // Set a small budget that only fits the last 2 turns
      const result = recentTurnsWithinCharBudget(turns, 50)
      expect(result.recent.length).toBeLessThanOrEqual(turns.length)
      expect(result.omitted).toBeGreaterThan(0)
      // Should include the most recent turns
      expect(result.recent[result.recent.length - 1]).toEqual(turns[turns.length - 1])
    })

    it('always includes at least one turn if turns exist, even if it exceeds budget', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'A very long message that exceeds the budget by itself'.repeat(100) },
      ]
      const result = recentTurnsWithinCharBudget(turns, 10)
      expect(result.recent.length).toBe(1)
      expect(result.recent[0]).toEqual(turns[0])
      expect(result.omitted).toBe(0)
    })

    it('calculates character length correctly including role and formatting overhead', () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Test' },
      ]
      // Role "user" (4) + content "Test" (4) + 12 overhead = 20 chars
      const result = recentTurnsWithinCharBudget(turns, 20)
      expect(result.recent.length).toBe(1)
      expect(result.omitted).toBe(0)
    })
  })

  describe('formatPmInputsSummary', () => {
    it('formats config with minimal required fields', () => {
      const config: PmAgentConfig = {
        repoRoot: '/test/repo',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('## Inputs (provided by HAL)')
      expect(result).toContain('repoRoot')
      expect(result).toContain('openaiModel')
      expect(result).toContain('gpt-4')
    })

    it('includes repoFullName when provided', () => {
      const config: PmAgentConfig = {
        ...mockConfig,
        repoFullName: 'owner/repo',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('owner/repo')
      expect(result).not.toContain('(not provided)')
    })

    it('shows "(not provided)" for missing repoFullName', () => {
      const result = formatPmInputsSummary(mockConfig)
      expect(result).toContain('(not provided)')
    })

    it('detects vision models correctly', () => {
      const visionConfig: PmAgentConfig = {
        ...mockConfig,
        openaiModel: 'gpt-4o',
        images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
      }
      const result = formatPmInputsSummary(visionConfig)
      expect(result).toContain('included')
    })

    it('shows conversation context source correctly', () => {
      const withContextPack: PmAgentConfig = {
        ...mockConfig,
        conversationContextPack: 'Pre-built context',
      }
      const result1 = formatPmInputsSummary(withContextPack)
      expect(result1).toContain('conversationContextPack (DB-derived)')

      const withHistory: PmAgentConfig = {
        ...mockConfig,
        conversationHistory: [{ role: 'user', content: 'Test' }],
      }
      const result2 = formatPmInputsSummary(withHistory)
      expect(result2).toContain('conversationHistory (client-provided)')

      const result3 = formatPmInputsSummary(mockConfig)
      expect(result3).toContain('none')
    })

    it('lists enabled and disabled tools correctly', () => {
      const result = formatPmInputsSummary(mockConfig)
      expect(result).toContain('## Tools available (this run)')
      expect(result).toContain('get_instruction_set')
      expect(result).toContain('read_file')
      expect(result).toContain('## Tools not available')
      expect(result).toContain('sync_tickets')
    })

    it('includes working memory status when present', () => {
      const config: PmAgentConfig = {
        ...mockConfig,
        workingMemoryText: 'Working memory content',
      }
      const result = formatPmInputsSummary(config)
      expect(result).toContain('working memory')
      expect(result).toContain('present')
    })
  })

  describe('buildContextPack', () => {
    it('includes inputs summary at the beginning', async () => {
      const result = await buildContextPack(mockConfig, 'Test message')
      expect(result).toContain('## Inputs (provided by HAL)')
    })

    it('includes user message in the output', async () => {
      const userMessage = 'Test user message'
      const result = await buildContextPack(mockConfig, userMessage)
      expect(result).toContain(userMessage)
    })

    it('includes working memory when provided', async () => {
      const workingMemory = 'Working memory content'
      const config: PmAgentConfig = {
        ...mockConfig,
        workingMemoryText: workingMemory,
      }
      const result = await buildContextPack(config, 'Test message')
      expect(result).toContain(workingMemory)
    })

    it('includes conversation history when provided', async () => {
      const history: ConversationTurn[] = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ]
      const config: PmAgentConfig = {
        ...mockConfig,
        conversationHistory: history,
      }
      const result = await buildContextPack(config, 'Current message')
      expect(result).toContain('## Conversation so far')
      expect(result).toContain('Previous message')
      expect(result).toContain('Previous response')
    })

    it('prefers conversationContextPack over conversationHistory', async () => {
      const contextPack = 'Pre-built context pack'
      const config: PmAgentConfig = {
        ...mockConfig,
        conversationContextPack: contextPack,
        conversationHistory: [{ role: 'user', content: 'Should not appear' }],
      }
      const result = await buildContextPack(config, 'Test message')
      expect(result).toContain(contextPack)
      expect(result).not.toContain('Should not appear')
    })

    it('includes git status section', async () => {
      const result = await buildContextPack(mockConfig, 'Test message')
      expect(result).toContain('## Git status')
    })

    it('loads local rules when available', async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
        const pathStr = String(filePath)
        if (pathStr.includes('ticket.template.md')) {
          return '## Ticket Template'
        }
        if (pathStr.includes('ready-to-start-checklist.md')) {
          return '## Checklist'
        }
        if (pathStr.includes('agent-instructions.mdc')) {
          return '## Agent Instructions'
        }
        if (pathStr.includes('ac-confirmation-checklist.mdc')) {
          return '## AC Checklist'
        }
        if (pathStr.includes('hal-tool-call-contract.mdc')) {
          return '## HAL Contract'
        }
        throw new Error('File not found')
      })

      const result = await buildContextPack(mockConfig, 'Test message')
      expect(result).toContain('## Instructions')
      expect(result).toContain('Repo rules (local)')
      expect(result).toContain('Agent Instructions')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs/promises'
import * as pathModule from 'path'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  buildContextPack,
  CONVERSATION_RECENT_MAX_CHARS,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding'

// Mock fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

// Mock path module
vi.mock('path', () => ({
  default: {
    resolve: (...args: string[]) => args.join('/'),
    join: (...args: string[]) => args.join('/'),
  },
  resolve: (...args: string[]) => args.join('/'),
  join: (...args: string[]) => args.join('/'),
}))

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty arrays when turns is empty', () => {
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

  it('truncates turns from the beginning when exceeding budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'B'.repeat(1000) },
      { role: 'user', content: 'C' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include the most recent turn
    expect(result.recent[result.recent.length - 1].content).toBe('C')
  })

  it('always includes at least one turn if turns exist', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 10)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('calculates character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    // Should account for role length (4) + content length (4) + 12 overhead
    expect(result.recent.length).toBe(1)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with GitHub repo when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      repoFullName: 'owner/repo',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).toContain('## Inputs (provided by HAL)')
  })

  it('shows "not provided" when GitHub repo is missing', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
  })

  it('detects vision models correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('included')
  })

  it('shows images as ignored for non-vision models', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists enabled and disabled tools correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('sync_tickets')
  })

  it('shows conversation context pack when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Summary of conversation',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('shows conversation history when context pack is not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('shows working memory when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory**: present')
  })
})

describe('buildContextPack', () => {
  const mockConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    repoFullName: 'test/repo',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
  })

  it('includes inputs summary in context pack', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('test/repo')
  })

  it('includes user message in context pack', async () => {
    const result = await buildContextPack(mockConfig, 'Test user message')
    expect(result).toContain('Test user message')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
      ],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('Response')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      workingMemoryText: 'Working memory: key points',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory: key points')
  })

  it('includes conversation context pack when provided instead of history', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationContextPack: 'Pre-built conversation summary',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Pre-built conversation summary')
    expect(result).toContain('## Conversation so far')
  })

  it('truncates long conversation history within character budget', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}: ${'A'.repeat(1000)}`,
      })),
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('omitted')
    expect(result).toContain(CONVERSATION_RECENT_MAX_CHARS.toLocaleString())
  })

  it('includes git status section', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Git status')
    // Note: Actual git execution is tested via integration tests
  })
})

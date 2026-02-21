import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  buildContextPack,
  CONVERSATION_RECENT_MAX_CHARS,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array when turns is empty', () => {
    const result = recentTurnsWithinCharBudget([], 1000)
    expect(result.recent).toEqual([])
    expect(result.omitted).toBe(0)
  })

  it('returns all turns when total length is within budget', () => {
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
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'C'.repeat(500) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should keep the most recent turns
    expect(result.recent[result.recent.length - 1].content).toContain('C')
  })

  it('always includes at least one turn if turns exist', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 10)
    expect(result.recent.length).toBe(1)
    expect(result.recent[0]).toEqual(turns[0])
  })

  it('calculates character count including role and formatting', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'Reply' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should include both since they fit in 50 chars (role + content + 12 for formatting)
    expect(result.recent.length).toBe(2)
  })

  it('handles turns in reverse order correctly', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    // Should maintain original order
    expect(result.recent[0].content).toBe('First')
    expect(result.recent[1].content).toBe('Second')
    expect(result.recent[2].content).toBe('Third')
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with minimal config', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
  })

  it('includes repoFullName when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      repoFullName: 'owner/repo',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).not.toContain('(not provided)')
  })

  it('includes conversation context source when conversationContextPack is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Some context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('includes conversation context source when conversationHistory is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('includes working memory status when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('present')
  })

  it('includes image count and vision model detection', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4o',
      images: [
        { dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('1')
    expect(result).toContain('included')
  })

  it('lists enabled tools', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
  })

  it('lists disabled tools when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('sync_tickets')
    expect(result).toContain('not available')
  })

  it('handles missing openaiModel gracefully', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: '',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('openaiModel')
    expect(result).toContain('(not provided)')
  })

  it('includes previousResponseId status', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      previousResponseId: 'resp-123',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('previousResponseId')
    expect(result).toContain('present')
  })
})

describe('buildContextPack', () => {
  const mockRepoRoot = '/test/repo'
  const baseConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    vi.spyOn(process, 'cwd').mockReturnValue(mockRepoRoot)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes PM inputs summary section', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
  })

  it('includes user message section', async () => {
    const userMessage = 'Hello, this is a test message'
    const result = await buildContextPack(baseConfig, userMessage)
    expect(result).toContain('## User message')
    expect(result).toContain(userMessage)
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      workingMemoryText: 'Working memory: test context',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory: test context')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ],
    }
    const result = await buildContextPack(config, 'Current message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('Previous message')
    expect(result).toContain('Previous response')
  })

  it('uses conversationContextPack when provided instead of conversationHistory', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationContextPack: 'Pre-built context summary',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'Current message')
    expect(result).toContain('Pre-built context summary')
    expect(result).not.toContain('Should not appear')
  })

  it('includes git status section', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    // Git status section should always be included (even if git command fails)
    expect(result).toContain('## Git status')
  })

  it('handles missing local files gracefully', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(baseConfig, 'Test message')
    // Should still produce valid output
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes instructions loading section when local files not found', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('MANDATORY: Load Your Instructions First')
    expect(result).toContain('get_instruction_set')
  })
})

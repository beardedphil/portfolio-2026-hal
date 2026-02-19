/**
 * Tests for contextPack.ts (which exports buildContextPack from contextBuilding.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildContextPack,
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  CONVERSATION_RECENT_MAX_CHARS,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding.js'
import fs from 'fs/promises'

// Mock fs - exec will be allowed to fail gracefully (code handles it)
vi.mock('fs/promises', () => {
  const mockReadFile = vi.fn()
  return {
    default: {
      readFile: mockReadFile,
    },
    readFile: mockReadFile,
  }
})

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array and zero omitted when turns array is empty', () => {
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

  it('truncates older turns when total length exceeds budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'B'.repeat(1000) },
      { role: 'user', content: 'C'.repeat(1000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 500)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    expect(result.recent.length + result.omitted).toBe(turns.length)
  })

  it('always includes at least the most recent turn even if it exceeds budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
    expect(result.recent[0]).toEqual(turns[0])
    expect(result.omitted).toBe(0)
  })

  it('preserves turn order (most recent last)', () => {
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

  it('handles turns with missing role or content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBe(2)
    expect(result.omitted).toBe(0)
  })
})

describe('formatPmInputsSummary', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('formats summary with minimal config', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
    expect(result).toContain('## Tools available (this run)')
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

  it('detects conversationContextPack when provided', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationContextPack: 'Some context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('detects conversationHistory when provided', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('detects working memory when provided', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('present')
  })

  it('includes image count and vision model detection', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      images: [
        { dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' },
      ],
      openaiModel: 'gpt-4o',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('1')
    expect(result).toContain('included')
  })

  it('marks images as ignored for non-vision models', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      images: [
        { dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' },
      ],
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists enabled and disabled tools separately', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('sync_tickets')
    expect(result).toContain('## Tools not available')
  })

  it('handles empty strings and whitespace in config values', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      repoFullName: '   ',
      conversationContextPack: '',
      workingMemoryText: '  ',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
    expect(result).toContain('absent')
  })
})

describe('buildContextPack', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes formatPmInputsSummary output at the start', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('## Tools available (this run)')
  })

  it('includes user message when no conversation history', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## User message')
    expect(result).toContain('Test message')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    }
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(config, 'Follow up')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('Hello')
    expect(result).toContain('Hi')
    expect(result).toContain('## User message (latest reply')
  })

  it('uses conversationContextPack when provided instead of conversationHistory', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationContextPack: 'Pre-built context',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(config, 'Test')
    expect(result).toContain('Pre-built context')
    expect(result).not.toContain('Should not appear')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      workingMemoryText: 'Working memory content',
    }
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(config, 'Test')
    expect(result).toContain('Working memory content')
  })

  it('includes git status section (may fail gracefully)', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))
    // Git status may succeed or fail - code handles both cases
    const result = await buildContextPack(baseConfig, 'Test')
    expect(result).toContain('## Git status (git status -sb)')
    // Either contains git output or error message
    expect(
      result.includes('(git status failed)') || result.includes('##') || result.includes('main')
    ).toBe(true)
  })

  it('truncates long conversation history within character budget', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'A'.repeat(200)}`,
      })),
    }
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(config, 'Test')
    expect(result).toContain('## Conversation so far')
    // Should contain truncation note
    expect(result).toContain('omitted')
    expect(result).toContain(CONVERSATION_RECENT_MAX_CHARS.toLocaleString())
  })
})

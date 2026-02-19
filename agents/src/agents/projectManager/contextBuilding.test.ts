import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Mock fetch globally
global.fetch = vi.fn()

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array when no turns provided', () => {
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
      { role: 'user', content: 'C'.repeat(1000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 500)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Most recent turn should be included
    expect(result.recent[result.recent.length - 1].content).toContain('C')
  })

  it('always includes at least one turn if any exist', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('handles turns with missing role or content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user' as any, content: undefined as any },
      { role: 'assistant', content: 'Valid content' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBeGreaterThan(0)
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
    expect(result).toContain('repoFullName')
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

  it('shows working memory status when provided', () => {
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

  it('shows image count and vision model detection', () => {
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
  })

  it('lists enabled and disabled tools', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
    expect(result).toContain('sync_tickets')
  })
})

describe('buildContextPack', () => {
  const mockRepoRoot = '/test/repo'
  const mockConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    repoFullName: 'test/repo',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, instructions: [] }),
    } as Response)
  })

  it('includes inputs summary in context pack', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('test/repo')
  }, 10000)

  it('includes user message in context pack', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const result = await buildContextPack(mockConfig, 'Hello, world!')
    expect(result).toContain('Hello, world!')
    expect(result).toContain('User message')
  }, 10000)

  it('includes working memory when provided', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const configWithMemory: PmAgentConfig = {
      ...mockConfig,
      workingMemoryText: 'Key points: A, B, C',
    }
    const result = await buildContextPack(configWithMemory, 'Test')
    expect(result).toContain('Key points: A, B, C')
  }, 10000)

  it('includes conversation history when provided', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const configWithHistory: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ],
    }
    const result = await buildContextPack(configWithHistory, 'Second message')
    expect(result).toContain('Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('First response')
  }, 10000)

  it('uses conversationContextPack when provided instead of conversationHistory', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const configWithBoth: PmAgentConfig = {
      ...mockConfig,
      conversationContextPack: 'Pre-built context summary',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(configWithBoth, 'Test')
    expect(result).toContain('Pre-built context summary')
    expect(result).not.toContain('Should not appear')
  }, 10000)

  it('includes git status in context pack', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (filePath.includes('api-base-url')) {
        return Promise.resolve('https://test.hal.app')
      }
      throw new Error('File not found')
    })

    const result = await buildContextPack(mockConfig, 'Test')
    expect(result).toContain('## Git status')
  }, 10000)
})

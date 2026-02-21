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

  it('returns all turns when within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('omits older turns when exceeding budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'B'.repeat(1000) },
      { role: 'user', content: 'C'.repeat(1000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 500)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include most recent turns first
    expect(result.recent[result.recent.length - 1].content).toContain('C')
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
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'Response' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should include both since they're small
    expect(result.recent.length).toBe(2)
  })
})

describe('formatPmInputsSummary', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('formats basic config without optional fields', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
    expect(result).toContain('## Tools available (this run)')
  })

  it('includes repoFullName when provided', () => {
    const config = { ...baseConfig, repoFullName: 'owner/repo' }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).not.toContain('(not provided)')
  })

  it('detects conversation context pack source', () => {
    const config = {
      ...baseConfig,
      conversationContextPack: 'Summary of conversation',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('detects conversation history source', () => {
    const config = {
      ...baseConfig,
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('shows working memory as present when provided', () => {
    const config = {
      ...baseConfig,
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('**working memory**: present')
  })

  it('shows working memory as absent when not provided', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('**working memory**: absent')
  })

  it('includes image count and vision model detection', () => {
    const config = {
      ...baseConfig,
      images: [
        { dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' },
      ],
      openaiModel: 'gpt-4o',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('**images**: 1')
    expect(result).toContain('included')
  })

  it('shows disabled tools section when tools are unavailable', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('Tools not available')
    expect(result).toContain('sync_tickets')
  })

  it('lists enabled tools correctly', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
    expect(result).toContain('create_ticket')
  })
})

describe('buildContextPack', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('Directory not found'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes inputs summary at the start', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
  })

  it('includes user message', async () => {
    const result = await buildContextPack(baseConfig, 'Hello, world!')
    expect(result).toContain('Hello, world!')
    expect(result).toContain('## User message')
  })

  it('includes conversation history when provided', async () => {
    const config = {
      ...baseConfig,
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ],
    }
    const result = await buildContextPack(config, 'Second message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('First response')
    expect(result).toContain('## User message (latest reply in the conversation above)')
  })

  it('uses conversationContextPack when provided instead of history', async () => {
    const config = {
      ...baseConfig,
      conversationContextPack: 'Pre-built conversation summary',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'New message')
    expect(result).toContain('Pre-built conversation summary')
    expect(result).not.toContain('Should not appear')
  })

  it('includes working memory when provided', async () => {
    const config = {
      ...baseConfig,
      workingMemoryText: 'Working memory: key facts and context',
    }
    const result = await buildContextPack(config, 'Test')
    expect(result).toContain('Working memory: key facts and context')
  })

  it('includes git status section', async () => {
    // Note: This test may fail if git is not available, but it verifies the section is added
    const result = await buildContextPack(baseConfig, 'Test')
    expect(result).toContain('## Git status')
  })

  it('handles missing local files gracefully', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(baseConfig, 'Test message')
    // Should still produce valid output
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes instruction loading instructions when local files not found', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(baseConfig, 'Test')
    expect(result).toContain('MANDATORY: Load Your Instructions First')
    expect(result).toContain('get_instruction_set')
  })
})

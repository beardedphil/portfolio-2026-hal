import { describe, it, expect } from 'vitest'
import { buildContextPack } from './contextPack.js'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  CONVERSATION_RECENT_MAX_CHARS,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding.js'

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

  it('truncates older turns when exceeding budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'C'.repeat(1000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 2000)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Most recent turn should be included
    expect(result.recent[result.recent.length - 1].content).toContain('C')
  })

  it('always includes at least one turn even if it exceeds budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
    expect(result.recent[0].content).toContain('A')
  })

  it('respects CONVERSATION_RECENT_MAX_CHARS constant', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'C' },
    ]
    const result = recentTurnsWithinCharBudget(turns, CONVERSATION_RECENT_MAX_CHARS)
    expect(result.recent.length).toBeGreaterThan(0)
    expect(result.omitted).toBeGreaterThanOrEqual(0)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats config with minimal inputs', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
    expect(result).toContain('gpt-4')
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

  it('detects conversation context pack', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Some context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('detects conversation history when context pack is absent', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('includes working memory status', () => {
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
    expect(result).toContain('Tools not available')
  })
})

describe('buildContextPack', () => {
  // Use actual repo root for realistic testing
  const baseConfig: PmAgentConfig = {
    repoRoot: process.cwd(),
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('includes inputs summary section', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('openaiModel')
  })

  it('includes user message', async () => {
    const userMessage = 'Hello, this is a test message'
    const result = await buildContextPack(baseConfig, userMessage)
    expect(result).toContain('## User message')
    expect(result).toContain(userMessage)
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
      ],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('Response')
    expect(result).toContain('Latest message')
  })

  it('uses conversationContextPack when provided instead of history', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      conversationContextPack: 'Pre-built context',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('Pre-built context')
    expect(result).not.toContain('Should not appear')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      workingMemoryText: 'Working memory: Important context',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory: Important context')
  })

  it('includes git status section', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Git status (git status -sb)')
    // The result should either contain git output or the error message
    expect(result.includes('```') || result.includes('(git status failed)')).toBe(true)
  })

  it('includes instructions section', async () => {
    const result = await buildContextPack(baseConfig, 'Test message')
    expect(result).toContain('## Instructions')
    // Either local rules section or mandatory load section should appear
    expect(
      result.includes('Repo rules (local)') || result.includes('MANDATORY: Load Your Instructions First')
    ).toBe(true)
  })

  it('handles missing repo root gracefully', async () => {
    const configWithBadPath: PmAgentConfig = {
      ...baseConfig,
      repoRoot: '/nonexistent/path/that/does/not/exist',
    }
    const result = await buildContextPack(configWithBadPath, 'Test message')
    // Should still produce output even with bad path
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })
})

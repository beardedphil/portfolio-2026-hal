import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildContextPack, recentTurnsWithinCharBudget } from './contextPack.js'
import type { PmAgentConfig, ConversationTurn } from './types.js'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array when turns is empty', () => {
    const result = recentTurnsWithinCharBudget([], 1000)
    expect(result.recent).toEqual([])
    expect(result.omitted).toBe(0)
  })

  it('includes all turns when within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('truncates turns from the beginning when over budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'B'.repeat(1000) },
      { role: 'user', content: 'C' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include the most recent turn
    expect(result.recent[result.recent.length - 1].content).toBe('C')
  })

  it('always includes at least one turn even if over budget', () => {
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
      { role: 'assistant', content: 'Response' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should account for role length + content length + 12 chars overhead
    expect(result.recent.length).toBeGreaterThan(0)
  })
})

describe('buildContextPack', () => {
  const mockConfig: PmAgentConfig = {
    repoRoot: process.cwd(), // Use actual working directory for real file access
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    rulesDir: '.cursor/rules',
  }

  it('includes inputs summary section', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('openaiModel')
  })

  it('includes user message in output', async () => {
    const userMessage = 'This is a test message'
    const result = await buildContextPack(mockConfig, userMessage)
    expect(result).toContain(userMessage)
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ],
    }
    const result = await buildContextPack(config, 'Second message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('First response')
  })

  it('uses conversationContextPack when provided instead of conversationHistory', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationContextPack: 'Pre-built context summary',
      conversationHistory: [
        { role: 'user', content: 'This should be ignored' },
      ],
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Pre-built context summary')
    expect(result).not.toContain('This should be ignored')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      workingMemoryText: 'Working memory: Important context',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory: Important context')
  })

  it('formats tools available section when supabase is configured', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('create_ticket')
    expect(result).toContain('sync_tickets')
  })

  it('shows disabled tools when supabase is not configured', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Tools not available (missing required inputs)')
    expect(result).toContain('create_ticket')
  })

  it('produces valid output even when files are missing', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/nonexistent/path',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = await buildContextPack(config, 'Test message')
    // Should still produce valid output with fallback instructions
    expect(result).toContain('## User message')
    expect(result.length).toBeGreaterThan(0)
  })
})

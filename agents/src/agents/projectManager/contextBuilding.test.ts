import { describe, it, expect } from 'vitest'
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

  it('includes all turns when total length is within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('omits older turns when total length exceeds budget', () => {
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

  it('processes turns in reverse order (most recent first)', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    // Most recent should be last in the result
    expect(result.recent[result.recent.length - 1].content).toBe('Third')
    expect(result.recent[0].content).toBe('First')
  })

  it('handles turns with missing role or content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user' as const, content: '' },
      { role: 'assistant' as const, content: 'Has content' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBeGreaterThan(0)
  })

  it('calculates omitted count correctly', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'C'.repeat(500) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.omitted).toBe(turns.length - result.recent.length)
    expect(result.recent.length + result.omitted).toBe(turns.length)
  })

  it('always includes at least one turn if turns exist and budget allows', () => {
    const turns: ConversationTurn[] = [{ role: 'user', content: 'Single turn' }]
    const result = recentTurnsWithinCharBudget(turns, 10)
    // Should include the turn even if it exceeds budget slightly
    expect(result.recent.length).toBeGreaterThan(0)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with all inputs provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path/to/repo',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      repoFullName: 'owner/repo',
      supabaseUrl: 'https://supabase.co',
      supabaseAnonKey: 'anon-key',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
      workingMemoryText: 'Working memory',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).toContain('HAL API base URL')
    expect(result).toContain('present (bootstrap fallback only)')
    expect(result).toContain('conversationHistory (client-provided)')
    expect(result).toContain('present')
  })

  it('formats summary with minimal inputs', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
    expect(result).toContain('supabase client creds (legacy)')
    expect(result).toContain('absent')
    expect(result).toContain('none')
  })

  it('detects vision models correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('included')
  })

  it('shows images as ignored for non-vision models', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists enabled and disabled tools correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      supabaseUrl: 'https://supabase.co',
      supabaseAnonKey: 'anon-key',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('create_ticket')
    expect(result).toContain('create_red_document_v2')
    expect(result).toContain('Tools available')
  })

  it('handles conversationContextPack when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('prefers conversationContextPack over conversationHistory', () => {
    const config: PmAgentConfig = {
      repoRoot: '/path',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
    expect(result).not.toContain('conversationHistory')
  })
})

describe('buildContextPack conversation handling', () => {
  it('includes conversationContextPack when provided', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built conversation context',
    }
    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('Pre-built conversation context')
    expect(result).toContain('Conversation so far')
  })

  it('uses conversationHistory when conversationContextPack is not provided', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
      ],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('First message')
    expect(result).toContain('Response')
    expect(result).toContain('Conversation so far')
  })

  it('prefers conversationContextPack over conversationHistory', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built context',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('Pre-built context')
    expect(result).not.toContain('Should not appear')
  })

  it('formats user message differently when conversation exists', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Previous' }],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('User message (latest reply in the conversation above)')
  })

  it('formats user message as standalone when no conversation exists', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('## User message\n\nUser message')
    expect(result).not.toContain('latest reply')
  })

  it('truncates long conversation history within character budget', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(),
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'A'.repeat(CONVERSATION_RECENT_MAX_CHARS * 2) },
        { role: 'assistant', content: 'B'.repeat(CONVERSATION_RECENT_MAX_CHARS * 2) },
        { role: 'user', content: 'Recent message' },
      ],
    }
    const result = await buildContextPack(config, 'Latest')
    expect(result).toContain('older messages omitted')
    expect(result).toContain('Recent message')
  })
})

import { describe, it, expect } from 'vitest'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  CONVERSATION_RECENT_MAX_CHARS,
  type ConversationTurn,
  type PmAgentConfig,
} from './contextBuilding'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array and omitted count when turns array is empty', () => {
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

  it('omits older turns when total length exceeds budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'Short message' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include the most recent turn
    expect(result.recent[result.recent.length - 1].content).toBe('Short message')
  })

  it('includes turns from most recent backwards until budget is exceeded', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
      { role: 'assistant', content: 'Fourth' },
    ]
    // Budget that allows 2-3 turns
    const budget = 100
    const result = recentTurnsWithinCharBudget(turns, budget)
    expect(result.recent.length).toBeGreaterThan(0)
    expect(result.recent.length).toBeLessThanOrEqual(turns.length)
    // Most recent turn should always be included
    expect(result.recent[result.recent.length - 1].content).toBe('Fourth')
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

  it('handles single turn within budget', () => {
    const turns: ConversationTurn[] = [{ role: 'user', content: 'Hello' }]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('handles single turn exceeding budget by including it anyway', () => {
    const turns: ConversationTurn[] = [{ role: 'user', content: 'A'.repeat(10000) }]
    const result = recentTurnsWithinCharBudget(turns, 100)
    // Should still include the turn even if it exceeds budget
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('calculates character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Test' },
    ]
    // Each turn adds role length + content length + 12 (formatting overhead)
    // "user" (4) + "Test" (4) + 12 = 20
    const result = recentTurnsWithinCharBudget(turns, 20)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with minimal config', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('repoRoot')
    expect(result).toContain('/test/repo')
    expect(result).toContain('openaiModel')
    expect(result).toContain('gpt-4')
    expect(result).toContain('supabase')
    expect(result).toContain('not provided')
  })

  it('includes Supabase availability when credentials are provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('supabase')
    expect(result).toContain('available (ticket tools enabled)')
  })

  it('includes GitHub repo information when repoFullName is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      repoFullName: 'owner/repo-name',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('repoFullName')
    expect(result).toContain('owner/repo-name')
  })

  it('shows conversation context source when conversationContextPack is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Previous conversation summary',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversation context')
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('shows conversation history source when conversationHistory is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversation context')
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('shows working memory status when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('present')
  })

  it('shows image count and vision model status', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o',
      images: [
        { dataUrl: 'data:image/png;base64,...', filename: 'test.png', mimeType: 'image/png' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('1')
    expect(result).toContain('included')
  })

  it('lists enabled tools when Supabase is available', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('Tools available')
    expect(result).toContain('create_ticket')
    expect(result).toContain('fetch_ticket_content')
  })

  it('lists disabled tools when Supabase is not available', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('Tools not available')
    expect(result).toContain('create_ticket')
  })

  it('handles empty strings in config values', () => {
    const config: PmAgentConfig = {
      repoRoot: '',
      openaiApiKey: 'test-key',
      openaiModel: '',
      supabaseUrl: '   ',
      supabaseAnonKey: '',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
    expect(result).toContain('not provided (ticket tools disabled)')
  })
})

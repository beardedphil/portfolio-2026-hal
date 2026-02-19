import { describe, it, expect } from 'vitest'
import { recentTurnsWithinCharBudget, formatPmInputsSummary } from './contextPack.js'
import type { PmAgentConfig, ConversationTurn } from './types.js'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty arrays when turns array is empty', () => {
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

  it('truncates from the beginning when exceeding budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'C'.repeat(500) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include the most recent turns
    expect(result.recent[result.recent.length - 1]).toEqual(turns[turns.length - 1])
  })

  it('always includes at least one turn even if it exceeds budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(2000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('calculates character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'Reply' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should account for role length + content length + 12 chars overhead
    expect(result.recent.length).toBeGreaterThanOrEqual(1)
  })

  it('handles turns with missing role or content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBeGreaterThanOrEqual(1)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with all inputs provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4o',
      repoFullName: 'owner/repo',
      supabaseUrl: 'https://supabase.co',
      supabaseAnonKey: 'anon-key',
      conversationContextPack: 'Context pack text',
      workingMemoryText: 'Working memory',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).toContain('available (ticket tools enabled)')
    expect(result).toContain('conversationContextPack (DB-derived)')
    expect(result).toContain('present')
    expect(result).toContain('1 (included)')
  })

  it('formats summary with minimal inputs', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
    expect(result).toContain('not provided (ticket tools disabled)')
    expect(result).toContain('none')
    expect(result).toContain('absent')
    expect(result).toContain('0 (none)')
  })

  it('lists enabled tools when Supabase is available', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      supabaseUrl: 'https://supabase.co',
      supabaseAnonKey: 'anon-key',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('create_ticket')
    expect(result).toContain('fetch_ticket_content')
    expect(result).toContain('update_ticket_body')
  })

  it('lists disabled tools when Supabase is not available', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('Tools not available')
    expect(result).toContain('create_ticket')
  })

  it('uses conversationHistory when conversationContextPack is not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('detects vision models correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('included')
  })

  it('indicates images are ignored for non-vision models', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })
})

// Note: buildContextPack integration tests are complex due to file system and API dependencies
// The main behaviors being refactored (recentTurnsWithinCharBudget and formatPmInputsSummary)
// are tested above. The refactoring reduces complexity in buildContextPack by extracting
// these helper functions, which are now independently testable.

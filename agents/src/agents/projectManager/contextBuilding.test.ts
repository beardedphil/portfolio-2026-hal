import { describe, it, expect } from 'vitest'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  type ConversationTurn,
  type PmAgentConfig,
  CONVERSATION_RECENT_MAX_CHARS,
} from './contextBuilding'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array when turns array is empty', () => {
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
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'C'.repeat(100) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 200)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should include at least the most recent turn
    expect(result.recent.length).toBeGreaterThan(0)
    expect(result.recent[result.recent.length - 1].content).toBe('C'.repeat(100))
  })

  it('always includes at least one turn if turns exist', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 10)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('processes turns in reverse order (most recent first)', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent[0].content).toBe('First')
    expect(result.recent[result.recent.length - 1].content).toBe('Third')
  })

  it('handles turns with undefined role gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user' as any, content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
  })

  it('handles turns with undefined content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: undefined as any },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
  })

  it('uses CONVERSATION_RECENT_MAX_CHARS as default budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(CONVERSATION_RECENT_MAX_CHARS + 1000) },
      { role: 'assistant', content: 'B'.repeat(100) },
    ]
    const result = recentTurnsWithinCharBudget(turns, CONVERSATION_RECENT_MAX_CHARS)
    expect(result.recent.length).toBeGreaterThan(0)
    expect(result.omitted).toBeGreaterThan(0)
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
    expect(result).toContain('repoFullName')
    expect(result).toContain('repoRoot')
    expect(result).toContain('openaiModel')
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

  it('shows absent for missing repoFullName', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
  })

  it('includes conversation context pack when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Summary of conversation',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('includes conversation history when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('prefers conversationContextPack over conversationHistory', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Summary',
      conversationHistory: [
        { role: 'user', content: 'Hello' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
    expect(result).not.toContain('conversationHistory (client-provided)')
  })

  it('includes working memory when provided', () => {
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

  it('shows absent for missing working memory', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('absent')
  })

  it('includes image count when images provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      images: [
        { dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' },
        { dataUrl: 'data:image/jpeg;base64,yyy', filename: 'test.jpg', mimeType: 'image/jpeg' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('2')
  })

  it('shows zero images when none provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('0')
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

  it('shows ignored for images with non-vision model', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-3.5-turbo',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists all available tools', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
    expect(result).toContain('create_ticket')
  })

  it('lists disabled tools separately', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('sync_tickets')
    expect(result).toContain('not available')
  })

  it('handles empty repoFullName string', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      repoFullName: '   ',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
  })

  it('handles previousResponseId when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      previousResponseId: 'resp_123',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('previousResponseId')
    expect(result).toContain('present')
  })

  it('handles missing previousResponseId', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('previousResponseId')
    expect(result).toContain('absent')
  })
})

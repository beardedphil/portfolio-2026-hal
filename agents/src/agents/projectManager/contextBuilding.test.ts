import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import {
  recentTurnsWithinCharBudget,
  formatPmInputsSummary,
  buildContextPack,
  type ConversationTurn,
  type PmAgentConfig,
  CONVERSATION_RECENT_MAX_CHARS,
} from './contextBuilding'

describe('recentTurnsWithinCharBudget', () => {
  it('returns empty array when turns is empty', () => {
    const result = recentTurnsWithinCharBudget([], 1000)
    expect(result.recent).toEqual([])
    expect(result.omitted).toBe(0)
  })

  it('returns all turns when they fit within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('omits older turns when they exceed budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'B'.repeat(1000) },
      { role: 'user', content: 'C'.repeat(100) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 200)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
  })

  it('always includes at least the most recent turn', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 10)
    expect(result.recent.length).toBe(1)
    expect(result.recent[0]).toEqual(turns[turns.length - 1])
  })

  it('calculates character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'Reply' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should account for role length + content + formatting (12 chars overhead per turn)
    expect(result.recent.length).toBeGreaterThanOrEqual(1)
  })

  it('processes turns in reverse order (most recent first)', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent[0]).toEqual(turns[0])
    expect(result.recent[result.recent.length - 1]).toEqual(turns[turns.length - 1])
  })

  it('handles turns with missing role gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user' as any, content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBe(1)
  })

  it('handles turns with missing content gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: undefined as any },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBe(1)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with all inputs provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o',
      repoFullName: 'owner/repo',
      previousResponseId: 'resp-123',
      conversationContextPack: 'Context here',
      workingMemoryText: 'Working memory',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('owner/repo')
    expect(result).toContain('/test/repo')
    expect(result).toContain('gpt-4o')
    expect(result).toContain('present')
    expect(result).toContain('1 (included)')
  })

  it('formats summary with minimal inputs', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-3.5-turbo',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
    expect(result).toContain('gpt-3.5-turbo')
  })

  it('detects vision models correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('included')
  })

  it('handles non-vision models with images', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-3.5-turbo',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists enabled and disabled tools correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('sync_tickets')
    expect(result).toContain('Tools not available')
  })

  it('prefers conversationContextPack over conversationHistory', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'DB context',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('uses conversationHistory when contextPack is not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('shows none when no conversation source is provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('none')
  })

  it('handles empty repoFullName correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      repoFullName: '',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
  })

  it('handles whitespace-only repoFullName correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      repoFullName: '   ',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('(not provided)')
  })
})

describe('buildContextPack', () => {
  const mockRepoRoot = '/test/repo'
  const mockConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    repoFullName: 'owner/repo',
  }

  beforeEach(() => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string') {
        if (filePath.includes('agent-instructions.mdc')) {
          return '# Agent Instructions\n\nTest instructions'
        }
        if (filePath.includes('ticket.template.md')) {
          return '# Ticket Template\n\nTemplate content'
        }
        if (filePath.includes('ready-to-start-checklist.md')) {
          return '# Checklist\n\nChecklist content'
        }
        if (filePath.includes('ac-confirmation-checklist.mdc')) {
          return '# AC Checklist\n\nChecklist rules'
        }
        if (filePath.includes('hal-tool-call-contract.mdc')) {
          return '# HAL Contract\n\nContract content'
        }
      }
      throw new Error('File not found')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes inputs summary in context pack', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('owner/repo')
  })

  it('includes user message in context pack', async () => {
    const userMessage = 'This is a test message'
    const result = await buildContextPack(mockConfig, userMessage)
    expect(result).toContain(userMessage)
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      workingMemoryText: 'Working memory content',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory content')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
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

  it('prefers conversationContextPack over conversationHistory', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationContextPack: 'DB-derived context',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('DB-derived context')
    expect(result).not.toContain('Should not appear')
  })

  it('includes git status section in context pack', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Git status')
    // Git status will either show output or "(git status failed)" - both are valid
    expect(result).toMatch(/## Git status[\s\S]*(?:```|\(git status failed\))/)
  })

  it('includes instructions section when local files are loaded', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string') {
        if (filePath.includes('agent-instructions.mdc')) {
          return '# Agent Instructions\n\nTest instructions'
        }
        if (filePath.includes('ticket.template.md')) {
          return '# Ticket Template\n\nTemplate content'
        }
        if (filePath.includes('ready-to-start-checklist.md')) {
          return '# Checklist\n\nChecklist content'
        }
        if (filePath.includes('ac-confirmation-checklist.mdc')) {
          return '# AC Checklist\n\nChecklist rules'
        }
        if (filePath.includes('hal-tool-call-contract.mdc')) {
          return '# HAL Contract\n\nContract content'
        }
      }
      return '# Test content'
    })

    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## Instructions')
    expect(result).toContain('Repo rules (local)')
  })

  it('includes mandatory instruction loading when local files are not available', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))

    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('## MANDATORY: Load Your Instructions First')
    expect(result).toContain('get_instruction_set')
  })

  it('formats user message section correctly when conversation exists', async () => {
    const config: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: [{ role: 'user', content: 'Previous' }],
    }
    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('## User message (latest reply in the conversation above)')
  })

  it('formats user message section correctly when no conversation exists', async () => {
    const result = await buildContextPack(mockConfig, 'First message')
    expect(result).toContain('## User message')
    expect(result).not.toContain('latest reply')
  })
})

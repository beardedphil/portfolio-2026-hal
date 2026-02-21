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

  it('truncates from the beginning when over budget', () => {
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

  it('handles turns in reverse order (most recent first)', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent[0].content).toBe('First')
    expect(result.recent[result.recent.length - 1].content).toBe('Third')
  })

  it('respects CONVERSATION_RECENT_MAX_CHARS constant', () => {
    const longContent = 'A'.repeat(CONVERSATION_RECENT_MAX_CHARS + 1000)
    const turns: ConversationTurn[] = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: 'Response' },
    ]
    const result = recentTurnsWithinCharBudget(turns, CONVERSATION_RECENT_MAX_CHARS)
    expect(result.omitted).toBeGreaterThan(0)
  })
})

describe('formatPmInputsSummary', () => {
  it('formats summary with all inputs provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o', // Vision model to test included images
      repoFullName: 'owner/repo',
      previousResponseId: 'resp-123',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
      workingMemoryText: 'Working memory content',
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
    expect(result).toContain('absent')
    expect(result).toContain('0 (none)')
  })

  it('detects vision models correctly', () => {
    const visionConfig: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(visionConfig)
    expect(result).toContain('included')
  })

  it('shows images as ignored for non-vision models', () => {
    const nonVisionConfig: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-3.5-turbo',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(nonVisionConfig)
    expect(result).toContain('ignored by model')
  })

  it('lists available tools correctly', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
    expect(result).toContain('create_ticket')
  })

  it('shows disabled tools when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('sync_tickets')
    expect(result).toContain('not available')
  })

  it('uses conversationContextPack when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('falls back to conversationHistory when contextPack not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test/repo',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
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
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      const pathStr = String(filePath)
      if (pathStr.includes('agent-instructions.mdc')) {
        return '# Agent Instructions\n\nTest instructions'
      }
      if (pathStr.includes('ticket.template.md')) {
        return '## Ticket Template\n\nTemplate content'
      }
      if (pathStr.includes('ready-to-start-checklist.md')) {
        return '## Checklist\n\nChecklist content'
      }
      if (pathStr.includes('api-base-url')) {
        return 'https://test-api.example.com'
      }
      if (pathStr.includes('hal-tool-call-contract.mdc')) {
        return '# HAL Contract\n\nContract content'
      }
      throw new Error(`File not found: ${pathStr}`)
    })
    // Mock fetch for HAL API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        instructions: [],
      }),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds context pack with local rules when available', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('Test message')
    expect(result).toContain('Repo rules (local)')
    expect(result).toContain('Test instructions')
  })

  it('includes working memory when provided', async () => {
    const configWithMemory: PmAgentConfig = {
      ...mockConfig,
      workingMemoryText: 'Working memory: Ticket 123 is in progress',
    }
    const result = await buildContextPack(configWithMemory, 'Test message')
    expect(result).toContain('Working memory: Ticket 123 is in progress')
  })

  it('includes conversation history when provided', async () => {
    const configWithHistory: PmAgentConfig = {
      ...mockConfig,
      conversationHistory: [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ],
    }
    const result = await buildContextPack(configWithHistory, 'Latest message')
    expect(result).toContain('Previous message')
    expect(result).toContain('Latest message')
    expect(result).toContain('Conversation so far')
  })

  it('uses conversationContextPack when provided instead of history', async () => {
    const configWithPack: PmAgentConfig = {
      ...mockConfig,
      conversationContextPack: 'Pre-built conversation summary',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(configWithPack, 'Latest message')
    expect(result).toContain('Pre-built conversation summary')
    expect(result).not.toContain('Should not appear')
  })

  it('handles missing local files gracefully', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('MANDATORY: Load Your Instructions First')
    expect(result).toContain('get_instruction_set')
  })

  it('includes ticket template when local files loaded', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('Ticket template')
    expect(result).toContain('Template content')
  })

  it('includes ready-to-start checklist when local files loaded', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('Ready-to-start checklist')
    expect(result).toContain('Checklist content')
  })

  it('includes git status section (handles failures gracefully)', async () => {
    const result = await buildContextPack(mockConfig, 'Test message')
    expect(result).toContain('Git status')
    // Git status may fail in test environment, which is handled gracefully
  })
})

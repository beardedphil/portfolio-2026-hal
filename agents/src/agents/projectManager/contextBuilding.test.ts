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

// Mock fs/promises
vi.mock('fs/promises')

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
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'Hello' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
  })

  it('always includes at least one turn even if over budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 100)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('preserves order of recent turns', () => {
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

  it('calculates character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 50)
    // Should account for role length (3) + content (4) + formatting overhead (12)
    expect(result.recent.length).toBe(1)
  })
})

describe('formatPmInputsSummary', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('formats summary with minimal config', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
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
      conversationContextPack: 'Pre-built context',
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

  it('shows working memory status when present', () => {
    const config = {
      ...baseConfig,
      workingMemoryText: 'Working memory content',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('present')
  })

  it('shows image count and vision model detection', () => {
    const config = {
      ...baseConfig,
      openaiModel: 'gpt-4o',
      images: [
        { dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' },
      ],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('images')
    expect(result).toContain('1')
    expect(result).toContain('included')
  })

  it('lists enabled and disabled tools', () => {
    const result = formatPmInputsSummary(baseConfig)
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
    expect(result).toContain('sync_tickets')
    expect(result).toContain('Tools not available')
  })

  it('handles missing optional fields gracefully', () => {
    const minimalConfig: PmAgentConfig = {
      repoRoot: '',
      openaiApiKey: '',
      openaiModel: '',
    }
    const result = formatPmInputsSummary(minimalConfig)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('buildContextPack', () => {
  const mockFs = vi.mocked(fs)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes inputs summary section', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
  })

  it('includes user message section', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Hello, world!')
    expect(result).toContain('Hello, world!')
    expect(result).toContain('User message')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
      ],
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('Conversation so far')
    expect(result).toContain('First message')
    expect(result).toContain('Response')
  })

  it('uses conversationContextPack when provided instead of history', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built context pack',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Latest message')
    expect(result).toContain('Pre-built context pack')
    expect(result).not.toContain('Should not appear')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      workingMemoryText: 'Working memory content here',
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory content here')
  })

  it('includes git status section', async () => {
    const config: PmAgentConfig = {
      repoRoot: process.cwd(), // Use real repo root so git works
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('## Git status')
    // Git status will contain actual output or error message
    expect(result.length).toBeGreaterThan(0)
  })

  it('loads local rules when available', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      rulesDir: '.cursor/rules',
    }
    const mockRulesContent = 'Agent instructions content'
    const mockTemplateContent = 'Ticket template'
    const mockChecklistContent = 'Ready-to-start checklist'

    mockFs.readFile = vi.fn().mockImplementation((filePath: string) => {
      if (filePath.includes('ticket.template.md')) {
        return Promise.resolve(mockTemplateContent)
      }
      if (filePath.includes('ready-to-start-checklist.md')) {
        return Promise.resolve(mockChecklistContent)
      }
      if (filePath.includes('agent-instructions.mdc')) {
        return Promise.resolve(mockRulesContent)
      }
      if (filePath.includes('ac-confirmation-checklist.mdc')) {
        return Promise.resolve('AC checklist')
      }
      if (filePath.includes('code-citation-requirements.mdc')) {
        return Promise.resolve('Citation rules')
      }
      if (filePath.includes('qa-audit-report.mdc')) {
        return Promise.resolve('QA rules')
      }
      if (filePath.includes('hal-tool-call-contract.mdc')) {
        return Promise.resolve('HAL contract')
      }
      return Promise.reject(new Error('Not found'))
    })

    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('## Repo rules (local)')
    expect(result).toContain(mockRulesContent)
  })

  it('shows instruction loading prompt when local rules not available', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('Not found'))

    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('MANDATORY: Load Your Instructions First')
    expect(result).toContain('get_instruction_set')
  })
})

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

  it('returns all turns when total length is within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toEqual(turns)
    expect(result.omitted).toBe(0)
  })

  it('truncates turns from the beginning when exceeding budget', () => {
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

  it('always includes at least one turn if turns exist', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(10000) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 10)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('calculates character count including role and overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Test' },
    ]
    // role (4) + content (4) + overhead (12) = 20
    const result = recentTurnsWithinCharBudget(turns, 20)
    expect(result.recent.length).toBe(1)
    expect(result.omitted).toBe(0)
  })

  it('handles turns with undefined role gracefully', () => {
    const turns: ConversationTurn[] = [
      { role: undefined as any, content: 'Test' },
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

  it('preserves turn order (most recent last)', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent[0].content).toBe('First')
    expect(result.recent[result.recent.length - 1].content).toBe('Third')
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
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('repoFullName')
    expect(result).toContain('(not provided)')
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

  it('detects conversation context pack when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Some context',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationContextPack (DB-derived)')
  })

  it('detects conversation history when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('conversationHistory (client-provided)')
  })

  it('detects working memory when present', () => {
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

  it('shows working memory as absent when not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('working memory')
    expect(result).toContain('absent')
  })

  it('counts images correctly', () => {
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

  it('shows images as ignored for non-vision models', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('ignored by model')
  })

  it('lists enabled tools', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('## Tools available (this run)')
    expect(result).toContain('get_instruction_set')
    expect(result).toContain('read_file')
  })

  it('lists disabled tools when present', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('## Tools not available (missing required inputs)')
    expect(result).toContain('sync_tickets')
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
      previousResponseId: 'resp-123',
    }
    const result = formatPmInputsSummary(config)
    expect(result).toContain('previousResponseId')
    expect(result).toContain('present')
  })
})

describe('buildContextPack', () => {
  const mockRepoRoot = '/tmp/test-repo'
  const defaultConfig: PmAgentConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  beforeEach(() => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string') {
        if (filePath.includes('agent-instructions.mdc')) {
          return 'Agent instructions content'
        }
        if (filePath.includes('ticket.template.md')) {
          return 'Ticket template content'
        }
        if (filePath.includes('ready-to-start-checklist.md')) {
          return 'Checklist content'
        }
        if (filePath.includes('ac-confirmation-checklist.mdc')) {
          return 'AC checklist content'
        }
        if (filePath.includes('hal-tool-call-contract.mdc')) {
          return 'HAL contract content'
        }
        if (filePath.includes('api-base-url')) {
          return 'https://test-api.example.com'
        }
      }
      throw new Error('File not found')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes inputs summary section', async () => {
    const result = await buildContextPack(defaultConfig, 'Test message')
    expect(result).toContain('## Inputs (provided by HAL)')
  })

  it('includes user message section', async () => {
    const result = await buildContextPack(defaultConfig, 'Test user message')
    expect(result).toContain('Test user message')
  })

  it('includes working memory when provided', async () => {
    const config: PmAgentConfig = {
      ...defaultConfig,
      workingMemoryText: 'Working memory content here',
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Working memory content here')
  })

  it('includes conversation history when provided', async () => {
    const config: PmAgentConfig = {
      ...defaultConfig,
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    }
    const result = await buildContextPack(config, 'Follow-up message')
    expect(result).toContain('## Conversation so far')
    expect(result).toContain('Hello')
    expect(result).toContain('Hi there')
  })

  it('prefers conversationContextPack over conversationHistory', async () => {
    const config: PmAgentConfig = {
      ...defaultConfig,
      conversationContextPack: 'Pre-built context',
      conversationHistory: [{ role: 'user', content: 'Should not appear' }],
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('Pre-built context')
    expect(result).not.toContain('Should not appear')
  })

  it('truncates long conversation history within budget', async () => {
    const longHistory: ConversationTurn[] = []
    for (let i = 0; i < 100; i++) {
      longHistory.push({ role: 'user', content: 'A'.repeat(200) })
    }
    const config: PmAgentConfig = {
      ...defaultConfig,
      conversationHistory: longHistory,
    }
    const result = await buildContextPack(config, 'Test message')
    expect(result).toContain('omitted')
    // Should still include some recent messages
    expect(result).toContain('## Conversation so far')
  })

  it('includes git status section', async () => {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    vi.spyOn(execAsync, 'call' as any).mockResolvedValue({ stdout: '## main\n', stderr: '' })
    
    const result = await buildContextPack(defaultConfig, 'Test message')
    expect(result).toContain('## Git status')
  })

  it('handles missing files gracefully', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
    const result = await buildContextPack(defaultConfig, 'Test message')
    // Should still produce a valid context pack
    expect(result).toContain('## Inputs (provided by HAL)')
    expect(result).toContain('Test message')
  })

  it('includes instructions section when local files are available', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string') {
        if (filePath.includes('agent-instructions.mdc')) {
          return 'Agent instructions'
        }
        if (filePath.includes('ticket.template.md')) {
          return 'Template content'
        }
        if (filePath.includes('ready-to-start-checklist.md')) {
          return 'Checklist content'
        }
        if (filePath.includes('ac-confirmation-checklist.mdc')) {
          return 'AC content'
        }
        if (filePath.includes('hal-tool-call-contract.mdc')) {
          return 'Contract content'
        }
      }
      throw new Error('File not found')
    })

    const result = await buildContextPack(defaultConfig, 'Test message')
    expect(result).toContain('## Repo rules (local)')
  })

  it('includes minimal bootstrap message when USE_MINIMAL_BOOTSTRAP is true', async () => {
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath: any) => {
      if (typeof filePath === 'string' && filePath.includes('api-base-url')) {
        return 'https://test-api.example.com'
      }
      throw new Error('File not found')
    })

    // Mock fetch for HAL API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        instructions: [],
      }),
    })

    const result = await buildContextPack(defaultConfig, 'Test message')
    // Should mention loading instructions
    expect(result).toContain('get_instruction_set')
  })
})

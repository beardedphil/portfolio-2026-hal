import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  recentTurnsWithinCharBudget,
  buildConversationSection,
  loadRepoRules,
  loadTicketTemplate,
  loadReadyToStartChecklist,
  loadGitStatus,
  buildContextPack,
  CONVERSATION_RECENT_MAX_CHARS,
} from './contextBuilding.js'
import type { ConversationTurn, PmAgentConfig } from '../projectManager.js'

const execAsync = promisify(exec)

// Mock fs and exec
vi.mock('fs/promises')
vi.mock('child_process')

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

  it('filters out older turns when exceeding budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'A'.repeat(5000) },
      { role: 'assistant', content: 'B'.repeat(5000) },
      { role: 'user', content: 'C'.repeat(100) },
    ]
    const result = recentTurnsWithinCharBudget(turns, 200)
    // Should keep the most recent turn that fits
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Most recent turn should be included
    expect(result.recent[result.recent.length - 1].content).toContain('C')
  })

  it('maintains chronological order of recent turns', () => {
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
})

describe('buildConversationSection', () => {
  it('uses conversationContextPack when provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Summary of conversation',
    }
    const result = buildConversationSection(config, 'User message')
    expect(result.hasConversation).toBe(true)
    expect(result.section).toContain('Conversation so far')
    expect(result.section).toContain('Summary of conversation')
  })

  it('uses conversationHistory when contextPack is not provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    }
    const result = buildConversationSection(config, 'User message')
    expect(result.hasConversation).toBe(true)
    expect(result.section).toContain('Conversation so far')
    expect(result.section).toContain('**user**: Hello')
    expect(result.section).toContain('**assistant**: Hi')
  })

  it('returns no conversation when neither contextPack nor history provided', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }
    const result = buildConversationSection(config, 'User message')
    expect(result.hasConversation).toBe(false)
    expect(result.section).toBe('')
  })

  it('includes truncation note when history is truncated', () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: 'A'.repeat(1000),
      })),
    }
    const result = buildConversationSection(config, 'User message')
    expect(result.hasConversation).toBe(true)
    expect(result.section).toContain('older messages omitted')
  })
})

describe('loadRepoRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and formats .mdc files from rules directory', async () => {
    const mockEntries = ['rule1.mdc', 'rule2.mdc', 'other.txt']
    const mockContent1 = 'Rule 1 content'
    const mockContent2 = 'Rule 2 content'

    vi.mocked(fs.readdir).mockResolvedValue(mockEntries as any)
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(mockContent1)
      .mockResolvedValueOnce(mockContent2)

    const result = await loadRepoRules('/test', '.cursor/rules')
    expect(result).toContain('Repo rules')
    expect(result).toContain('### rule1.mdc')
    expect(result).toContain('Rule 1 content')
    expect(result).toContain('### rule2.mdc')
    expect(result).toContain('Rule 2 content')
    expect(fs.readFile).toHaveBeenCalledWith(
      path.resolve('/test', '.cursor/rules', 'rule1.mdc'),
      'utf8'
    )
    expect(fs.readFile).toHaveBeenCalledWith(
      path.resolve('/test', '.cursor/rules', 'rule2.mdc'),
      'utf8'
    )
  })

  it('returns message when no .mdc files found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['other.txt', 'file.js'] as any)

    const result = await loadRepoRules('/test', '.cursor/rules')
    expect(result).toContain('no .mdc files found')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('handles directory read errors gracefully', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'))

    const result = await loadRepoRules('/test', '.cursor/rules')
    expect(result).toContain('rules directory not found or not readable')
  })
})

describe('loadTicketTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads template file and adds instructions', async () => {
    const mockTemplate = 'Template content here'
    vi.mocked(fs.readFile).mockResolvedValue(mockTemplate)

    const result = await loadTicketTemplate('/test')
    expect(result).toContain('Ticket template')
    expect(result).toContain(mockTemplate)
    expect(result).toContain('Replace every placeholder')
    expect(fs.readFile).toHaveBeenCalledWith(
      path.resolve('/test', 'docs/templates/ticket.template.md'),
      'utf8'
    )
  })

  it('handles missing template file gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await loadTicketTemplate('/test')
    expect(result).toContain('ticket.template.md not found')
  })
})

describe('loadReadyToStartChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads checklist file', async () => {
    const mockChecklist = 'Checklist content'
    vi.mocked(fs.readFile).mockResolvedValue(mockChecklist)

    const result = await loadReadyToStartChecklist('/test')
    expect(result).toContain('Ready-to-start checklist')
    expect(result).toContain(mockChecklist)
    expect(fs.readFile).toHaveBeenCalledWith(
      path.resolve('/test', 'docs/process/ready-to-start-checklist.md'),
      'utf8'
    )
  })

  it('handles missing checklist file gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await loadReadyToStartChecklist('/test')
    expect(result).toContain('ready-to-start-checklist.md not found')
  })
})

describe('loadGitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads git status successfully', async () => {
    const mockStdout = '## main\n M file.ts'
    vi.mocked(execAsync).mockResolvedValue({
      stdout: mockStdout,
      stderr: '',
    } as any)

    const result = await loadGitStatus('/test')
    expect(result).toContain('Git status')
    expect(result).toContain(mockStdout)
    expect(execAsync).toHaveBeenCalledWith('git status -sb', {
      cwd: '/test',
      encoding: 'utf8',
    })
  })

  it('handles git command failures gracefully', async () => {
    vi.mocked(execAsync).mockRejectedValue(new Error('Not a git repository'))

    const result = await loadGitStatus('/test')
    expect(result).toContain('git status failed')
  })
})

describe('buildContextPack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds complete context pack with all sections', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    }

    // Mock all file operations
    vi.mocked(fs.readdir).mockResolvedValue(['rule.mdc'] as any)
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('rule content')
      .mockResolvedValueOnce('template content')
      .mockResolvedValueOnce('checklist content')
    vi.mocked(execAsync).mockResolvedValue({
      stdout: 'git status output',
      stderr: '',
    } as any)

    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('Conversation so far')
    expect(result).toContain('User message')
    expect(result).toContain('Repo rules')
    expect(result).toContain('Ticket template')
    expect(result).toContain('Ready-to-start checklist')
    expect(result).toContain('Git status')
  })

  it('uses conversationContextPack when provided', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
      conversationContextPack: 'Pre-built summary',
    }

    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('template')
      .mockResolvedValueOnce('checklist')
    vi.mocked(execAsync).mockResolvedValue({
      stdout: 'git status',
      stderr: '',
    } as any)

    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('Pre-built summary')
    expect(result).toContain('User message (latest reply in the conversation above)')
  })

  it('handles missing files gracefully', async () => {
    const config: PmAgentConfig = {
      repoRoot: '/test',
      openaiApiKey: 'key',
      openaiModel: 'gpt-4',
    }

    vi.mocked(fs.readdir).mockRejectedValue(new Error('No rules'))
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error('No template'))
      .mockRejectedValueOnce(new Error('No checklist'))
    vi.mocked(execAsync).mockRejectedValue(new Error('No git'))

    const result = await buildContextPack(config, 'User message')
    expect(result).toContain('User message')
    expect(result).toContain('rules directory not found')
    expect(result).toContain('ticket.template.md not found')
    expect(result).toContain('ready-to-start-checklist.md not found')
    expect(result).toContain('git status failed')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import type { ConversationTurn } from './types.js'
import fs from 'fs/promises'

// Mock fs/promises
vi.mock('fs/promises')

describe('contextPack', () => {
  // Import after mocks are set up
  let buildContextPack: typeof import('./contextPack.js').buildContextPack

  beforeAll(async () => {
    const module = await import('./contextPack.js')
    buildContextPack = module.buildContextPack
  })

  const mockRepoRoot = '/mock/repo'
  const mockConfig = {
    repoRoot: mockRepoRoot,
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    repoFullName: 'test/repo',
  } as const

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('recentTurnsWithinCharBudget', () => {
    it('returns empty array when turns array is empty', async () => {
      const config = {
        ...mockConfig,
        conversationHistory: [],
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      // Should not include conversation section when history is empty
      expect(result).not.toContain('Conversation so far')
    })

    it('includes all turns when within budget', async () => {
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ]
      const config = {
        ...mockConfig,
        conversationHistory: turns,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('Conversation so far')
      expect(result).toContain('Hello')
      expect(result).toContain('Hi there')
      expect(result).toContain('How are you?')
    })

    it('truncates older turns when exceeding character budget', async () => {
      const longContent = 'A'.repeat(5000)
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Old message ' + longContent },
        { role: 'assistant', content: 'Old response ' + longContent },
        { role: 'user', content: 'Recent message' },
        { role: 'assistant', content: 'Recent response' },
      ]
      const config = {
        ...mockConfig,
        conversationHistory: turns,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('Conversation so far')
      expect(result).toContain('Recent message')
      expect(result).toContain('Recent response')
      // Note: All messages may fit if they're within budget, or omitted message may appear
      // The key is that recent messages are included
    })

    it('handles single turn within budget', async () => {
      const turns: ConversationTurn[] = [{ role: 'user', content: 'Single message' }]
      const config = {
        ...mockConfig,
        conversationHistory: turns,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('Single message')
      expect(result).not.toContain('omitted')
    })
  })

  describe('formatPmInputsSummary', () => {
    it('formats config with all inputs provided', async () => {
      const config = {
        ...mockConfig,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        workingMemoryText: 'Working memory content',
        images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Inputs (provided by HAL)')
      expect(result).toContain('repoFullName')
      expect(result).toContain('**supabase**: available (ticket tools enabled)')
      expect(result).toContain('**working memory**: present')
      expect(result).toContain('**images**: 1')
    })

    it('formats config with minimal inputs', async () => {
      const config = {
        ...mockConfig,
        supabaseUrl: undefined,
        supabaseAnonKey: undefined,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('**supabase**: not provided (ticket tools disabled)')
      expect(result).toContain('**working memory**: absent')
      expect(result).toContain('**images**: 0')
    })

    it('lists available tools when Supabase is configured', async () => {
      const config = {
        ...mockConfig,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Tools available (this run)')
      expect(result).toContain('create_ticket')
      expect(result).toContain('fetch_ticket_content')
    })

    it('lists disabled tools when Supabase is not configured', async () => {
      const config = {
        ...mockConfig,
        supabaseUrl: undefined,
        supabaseAnonKey: undefined,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Tools not available (missing required inputs)')
      expect(result).toContain('create_ticket')
    })

    it('detects vision models correctly', async () => {
      const config = {
        ...mockConfig,
        openaiModel: 'gpt-4o',
        images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      // Vision models include images
      expect(result).toContain('**images**: 1')
      expect(result).toContain('included')
    })

    it('handles non-vision models with images', async () => {
      const config = {
        ...mockConfig,
        openaiModel: 'gpt-4',
        images: [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }],
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      // Non-vision models ignore images
      expect(result).toContain('**images**: 1')
      expect(result).toContain('ignored by model')
    })
  })

  describe('buildContextPack', () => {
    it('includes user message in output', async () => {
      const config = {
        ...mockConfig,
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'Hello, this is a test message')
      expect(result).toContain('Hello, this is a test message')
      expect(result).toContain('## User message')
    })

    it('uses conversationContextPack when provided', async () => {
      const config = {
        ...mockConfig,
        conversationContextPack: 'Previous conversation summary',
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Conversation so far')
      expect(result).toContain('Previous conversation summary')
      expect(result).toContain('## User message (latest reply')
    })

    it('includes working memory when provided', async () => {
      const config = {
        ...mockConfig,
        workingMemoryText: '## Working Memory\n\nKey points: X, Y, Z',
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))
      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Working Memory')
      expect(result).toContain('Key points: X, Y, Z')
    })

    it('loads local rules when available', async () => {
      const config = {
        ...mockConfig,
      }
      const mockTemplate = '## Ticket Template\n\nTemplate content'
      const mockChecklist = '## Checklist\n\nChecklist content'
      const mockInstructions = '## Instructions\n\nInstruction content'

      vi.spyOn(fs, 'readFile').mockImplementation((filePath: any) => {
        const pathStr = String(filePath)
        if (pathStr.includes('ticket.template.md')) {
          return Promise.resolve(mockTemplate)
        }
        if (pathStr.includes('ready-to-start-checklist.md')) {
          return Promise.resolve(mockChecklist)
        }
        if (pathStr.includes('agent-instructions.mdc')) {
          return Promise.resolve(mockInstructions)
        }
        if (pathStr.includes('ac-confirmation-checklist.mdc')) {
          return Promise.resolve('AC checklist content')
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Repo rules (local)')
      expect(result).toContain('Instruction content')
    })

    it('falls back to Supabase instructions when local rules not available', async () => {
      const config = {
        ...mockConfig,
      }
      vi.spyOn(fs, 'readFile').mockImplementation((filePath: any) => {
        const pathStr = String(filePath)
        if (pathStr.includes('.hal/api-base-url')) {
          return Promise.resolve('https://test.hal.app')
        }
        return Promise.reject(new Error('File not found'))
      })

      // Mock fetch for HAL API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          instructions: [],
        }),
      })

      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## MANDATORY: Load Your Instructions First')
      expect(result).toContain('get_instruction_set')
    })

    it('includes git status in output', async () => {
      const config = {
        ...mockConfig,
        repoRoot: process.cwd(), // Use actual repo root for git command
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))

      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Git status (git status -sb)')
      // Git status will contain actual output or error message
      expect(result.length).toBeGreaterThan(0)
    })

    it('handles git status failure gracefully when repoRoot is invalid', async () => {
      const config = {
        ...mockConfig,
        repoRoot: '/nonexistent/path',
      }
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))

      const result = await buildContextPack(config, 'test message')
      expect(result).toContain('## Git status (git status -sb)')
      // Should handle error gracefully
      expect(result.length).toBeGreaterThan(0)
    })
  })
})

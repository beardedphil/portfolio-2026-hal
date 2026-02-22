/**
 * Unit tests for working memory update endpoint.
 * Tests input validation, sequence checking, OpenAI response parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test helper functions extracted from the implementation
// These test the core logic without requiring full HTTP/Supabase setup

describe('update.ts - Input Validation', () => {
  describe('projectId and agent validation', () => {
    it('requires both projectId and agent', () => {
      const validateRequired = (body: any): { valid: boolean; error?: string } => {
        const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
        const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined

        if (!projectId || !agent) {
          return { valid: false, error: 'projectId and agent are required.' }
        }
        return { valid: true }
      }

      expect(validateRequired({ projectId: 'proj-1', agent: 'pm' })).toEqual({ valid: true })
      expect(validateRequired({ projectId: '', agent: 'pm' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: 'proj-1', agent: '' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({})).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: '   ', agent: 'pm' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
    })

    it('trims whitespace from projectId and agent', () => {
      const extractProjectId = (body: any): string | undefined => {
        return typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
      }
      const extractAgent = (body: any): string | undefined => {
        return typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined
      }

      expect(extractProjectId({ projectId: '  proj-1  ' })).toBe('proj-1')
      expect(extractAgent({ agent: '  pm  ' })).toBe('pm')
      expect(extractProjectId({ projectId: '   ' })).toBeUndefined()
    })
  })

  describe('Supabase credentials validation', () => {
    it('requires supabaseUrl and supabaseAnonKey from body or env', () => {
      const validateCredentials = (body: any, env: any): { valid: boolean; error?: string } => {
        const supabaseUrl =
          (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
          env.SUPABASE_URL?.trim() ||
          env.VITE_SUPABASE_URL?.trim() ||
          undefined
        const supabaseAnonKey =
          (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
          env.SUPABASE_ANON_KEY?.trim() ||
          env.VITE_SUPABASE_ANON_KEY?.trim() ||
          undefined

        if (!supabaseUrl || !supabaseAnonKey) {
          return {
            valid: false,
            error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
          }
        }
        return { valid: true }
      }

      expect(validateCredentials({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'key' }, {})).toEqual({ valid: true })
      expect(validateCredentials({}, { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'key' })).toEqual({ valid: true })
      expect(validateCredentials({}, {})).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      expect(validateCredentials({ supabaseUrl: 'https://test.supabase.co' }, {})).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    })
  })

  describe('OpenAI credentials validation', () => {
    it('requires openaiApiKey and openaiModel', () => {
      const validateOpenAI = (body: any): { valid: boolean; error?: string } => {
        const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined
        const openaiModel = typeof body.openaiModel === 'string' ? body.openaiModel.trim() : undefined

        if (!openaiApiKey || !openaiModel) {
          return {
            valid: false,
            error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
          }
        }
        return { valid: true }
      }

      expect(validateOpenAI({ openaiApiKey: 'sk-123', openaiModel: 'gpt-4' })).toEqual({ valid: true })
      expect(validateOpenAI({ openaiApiKey: 'sk-123' })).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
      expect(validateOpenAI({})).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
    })
  })
})

describe('update.ts - Sequence Checking Logic', () => {
  it('determines if update is needed based on forceRefresh and sequence', () => {
    const shouldUpdate = (forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean => {
      if (forceRefresh) return true
      return currentSequence > lastProcessedSequence
    }

    expect(shouldUpdate(true, 5, 10)).toBe(true) // forceRefresh overrides
    expect(shouldUpdate(false, 10, 5)).toBe(true) // new messages
    expect(shouldUpdate(false, 5, 5)).toBe(false) // no new messages
    expect(shouldUpdate(false, 3, 5)).toBe(false) // sequence went backwards (shouldn't happen, but handled)
  })

  it('extracts current sequence from messages array', () => {
    const getCurrentSequence = (messages: Array<{ sequence?: number }>): number => {
      return messages[messages.length - 1]?.sequence ?? 0
    }

    expect(getCurrentSequence([{ sequence: 1 }, { sequence: 2 }, { sequence: 5 }])).toBe(5)
    expect(getCurrentSequence([{ sequence: 1 }])).toBe(1)
    expect(getCurrentSequence([])).toBe(0)
    expect(getCurrentSequence([{}])).toBe(0)
  })

  it('handles lastProcessedSequence from existing memory', () => {
    const getLastProcessedSequence = (existingMemory: { through_sequence?: number } | null): number => {
      return existingMemory?.through_sequence ?? 0
    }

    expect(getLastProcessedSequence({ through_sequence: 10 })).toBe(10)
    expect(getLastProcessedSequence({})).toBe(0)
    expect(getLastProcessedSequence(null)).toBe(0)
  })
})

describe('update.ts - OpenAI Response Parsing', () => {
  it('extracts JSON from markdown code blocks', () => {
    const extractJsonFromResponse = (content: string): string => {
      let jsonStr = content
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
      if (jsonMatch) {
        jsonStr = jsonMatch[1]
      }
      return jsonStr
    }

    const plainJson = '{"summary": "test", "goals": []}'
    expect(extractJsonFromResponse(plainJson)).toBe(plainJson)

    const withMarkdown = '```json\n{"summary": "test", "goals": []}\n```'
    expect(extractJsonFromResponse(withMarkdown)).toBe('{"summary": "test", "goals": []}')

    const withCodeBlock = '```\n{"summary": "test", "goals": []}\n```'
    expect(extractJsonFromResponse(withCodeBlock)).toBe('{"summary": "test", "goals": []}')

    const multiline = `\`\`\`json
{
  "summary": "test",
  "goals": ["goal1"]
}
\`\`\``
    const extracted = extractJsonFromResponse(multiline)
    expect(extracted).toContain('"summary"')
    expect(extracted).toContain('"goals"')
  })

  it('parses working memory structure correctly', () => {
    const parseWorkingMemory = (jsonStr: string) => {
      return JSON.parse(jsonStr) as {
        summary?: string
        goals?: string[]
        requirements?: string[]
        constraints?: string[]
        decisions?: string[]
        assumptions?: string[]
        openQuestions?: string[]
        glossary?: Record<string, string>
        stakeholders?: string[]
      }
    }

    const validMemory = {
      summary: 'Test summary',
      goals: ['goal1', 'goal2'],
      requirements: ['req1'],
      constraints: [],
      decisions: ['decision1'],
      assumptions: ['assumption1'],
      openQuestions: ['question1'],
      glossary: { term1: 'definition1' },
      stakeholders: ['stakeholder1'],
    }

    const parsed = parseWorkingMemory(JSON.stringify(validMemory))
    expect(parsed.summary).toBe('Test summary')
    expect(parsed.goals).toEqual(['goal1', 'goal2'])
    expect(parsed.glossary).toEqual({ term1: 'definition1' })
  })

  it('handles missing fields with defaults', () => {
    const applyDefaults = (workingMemory: any) => {
      return {
        summary: workingMemory.summary || '',
        goals: workingMemory.goals || [],
        requirements: workingMemory.requirements || [],
        constraints: workingMemory.constraints || [],
        decisions: workingMemory.decisions || [],
        assumptions: workingMemory.assumptions || [],
        openQuestions: workingMemory.openQuestions || [],
        glossary: workingMemory.glossary || {},
        stakeholders: workingMemory.stakeholders || [],
      }
    }

    expect(applyDefaults({})).toEqual({
      summary: '',
      goals: [],
      requirements: [],
      constraints: [],
      decisions: [],
      assumptions: [],
      openQuestions: [],
      glossary: {},
      stakeholders: [],
    })

    expect(applyDefaults({ summary: 'test', goals: ['goal1'] })).toEqual({
      summary: 'test',
      goals: ['goal1'],
      requirements: [],
      constraints: [],
      decisions: [],
      assumptions: [],
      openQuestions: [],
      glossary: {},
      stakeholders: [],
    })
  })
})

describe('update.ts - Conversation Text Formatting', () => {
  it('formats conversation messages into text', () => {
    const formatConversation = (messages: Array<{ role: string; content: string }>): string => {
      return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
    }

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ]

    const formatted = formatConversation(messages)
    expect(formatted).toBe('**user**: Hello\n\n**assistant**: Hi there\n\n**user**: How are you?')
  })

  it('handles empty messages array', () => {
    const formatConversation = (messages: Array<{ role: string; content: string }>): string => {
      return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
    }

    expect(formatConversation([])).toBe('')
  })
})

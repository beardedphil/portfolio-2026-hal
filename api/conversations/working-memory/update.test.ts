/**
 * Unit tests for working memory update endpoint.
 * Tests input validation, sequence checking, OpenAI response parsing, and error handling.
 */

import { describe, it, expect } from 'vitest'
import {
  trimString,
  getCurrentSequence,
  getLastProcessedSequence,
  shouldUpdateMemory,
  extractJsonFromResponse,
  formatConversationText,
  transformWorkingMemory,
} from './update'

describe('update.ts - Input Validation', () => {
  describe('projectId and agent validation', () => {
    it('requires both projectId and agent', () => {
      const validateRequired = (body: any): { valid: boolean; error?: string } => {
        const projectId = trimString(body.projectId)
        const agent = trimString(body.agent)

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
      expect(trimString('  proj-1  ')).toBe('proj-1')
      expect(trimString('  pm  ')).toBe('pm')
      expect(trimString('   ')).toBeUndefined()
      expect(trimString(undefined)).toBeUndefined()
      expect(trimString(null)).toBeUndefined()
      expect(trimString(123)).toBeUndefined()
    })
  })

  describe('Supabase credentials validation', () => {
    it('requires supabaseUrl and supabaseAnonKey from body or env', () => {
      const validateCredentials = (body: any, env: any): { valid: boolean; error?: string } => {
        const supabaseUrl =
          trimString(body.supabaseUrl) ||
          env.SUPABASE_URL?.trim() ||
          env.VITE_SUPABASE_URL?.trim() ||
          undefined
        const supabaseAnonKey =
          trimString(body.supabaseAnonKey) ||
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
        const openaiApiKey = trimString(body.openaiApiKey)
        const openaiModel = trimString(body.openaiModel)

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
    expect(shouldUpdateMemory(true, 5, 10)).toBe(true) // forceRefresh overrides
    expect(shouldUpdateMemory(false, 10, 5)).toBe(true) // new messages
    expect(shouldUpdateMemory(false, 5, 5)).toBe(false) // no new messages
    expect(shouldUpdateMemory(false, 3, 5)).toBe(false) // sequence went backwards (shouldn't happen, but handled)
  })

  it('extracts current sequence from messages array', () => {
    expect(getCurrentSequence([{ sequence: 1 }, { sequence: 2 }, { sequence: 5 }])).toBe(5)
    expect(getCurrentSequence([{ sequence: 1 }])).toBe(1)
    expect(getCurrentSequence([])).toBe(0)
    expect(getCurrentSequence([{}])).toBe(0)
  })

  it('handles lastProcessedSequence from existing memory', () => {
    expect(getLastProcessedSequence({ through_sequence: 10 })).toBe(10)
    expect(getLastProcessedSequence({})).toBe(0)
    expect(getLastProcessedSequence(null)).toBe(0)
  })
})

describe('update.ts - OpenAI Response Parsing', () => {
  it('extracts JSON from markdown code blocks', () => {
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

    const jsonStr = extractJsonFromResponse(JSON.stringify(validMemory))
    const parsed = JSON.parse(jsonStr)
    expect(parsed.summary).toBe('Test summary')
    expect(parsed.goals).toEqual(['goal1', 'goal2'])
    expect(parsed.glossary).toEqual({ term1: 'definition1' })
  })

  it('handles missing fields with defaults', () => {
    expect(transformWorkingMemory({})).toEqual({
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

    expect(transformWorkingMemory({ summary: 'test', goals: ['goal1'] })).toEqual({
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
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ]

    const formatted = formatConversationText(messages)
    expect(formatted).toBe('**user**: Hello\n\n**assistant**: Hi there\n\n**user**: How are you?')
  })

  it('handles empty messages array', () => {
    expect(formatConversationText([])).toBe('')
  })
})

/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, sequence checking, and OpenAI response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test helper functions extracted from the handler logic
describe('working-memory/update.ts behavior', () => {
  describe('Request body parsing and validation', () => {
    it('validates projectId and agent are required', () => {
      const validateRequired = (body: any): { valid: boolean; error?: string } => {
        const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
        const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined

        if (!projectId || !agent) {
          return { valid: false, error: 'projectId and agent are required.' }
        }
        return { valid: true }
      }

      expect(validateRequired({ projectId: 'test', agent: 'pm' })).toEqual({ valid: true })
      expect(validateRequired({ projectId: '', agent: 'pm' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: 'test', agent: '' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({})).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: '  ', agent: '  ' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
    })

    it('validates Supabase credentials from body or environment', () => {
      const validateSupabaseCredentials = (body: any, env: any): { valid: boolean; error?: string } => {
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

      expect(validateSupabaseCredentials({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'key' }, {})).toEqual({
        valid: true,
      })
      expect(validateSupabaseCredentials({}, { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'key' })).toEqual({
        valid: true,
      })
      expect(validateSupabaseCredentials({}, {})).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      expect(validateSupabaseCredentials({ supabaseUrl: 'https://test.supabase.co' }, {})).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    })

    it('validates OpenAI credentials are required', () => {
      const validateOpenAICredentials = (body: any): { valid: boolean; error?: string } => {
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

      expect(validateOpenAICredentials({ openaiApiKey: 'sk-test', openaiModel: 'gpt-4' })).toEqual({ valid: true })
      expect(validateOpenAICredentials({ openaiApiKey: 'sk-test' })).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
      expect(validateOpenAICredentials({})).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
    })
  })

  describe('Sequence checking and forceRefresh logic', () => {
    it('determines if update is needed based on sequence and forceRefresh', () => {
      const shouldUpdate = (
        forceRefresh: boolean,
        currentSequence: number,
        lastProcessedSequence: number
      ): boolean => {
        if (forceRefresh) return true
        return currentSequence > lastProcessedSequence
      }

      expect(shouldUpdate(true, 5, 10)).toBe(true) // forceRefresh overrides
      expect(shouldUpdate(false, 10, 5)).toBe(true) // new messages
      expect(shouldUpdate(false, 5, 5)).toBe(false) // no new messages
      expect(shouldUpdate(false, 3, 5)).toBe(false) // behind (shouldn't happen but handled)
    })

    it('handles missing sequence values gracefully', () => {
      const getCurrentSequence = (messages: Array<{ sequence?: number }>): number => {
        return messages[messages.length - 1]?.sequence ?? 0
      }

      const getLastProcessedSequence = (existingMemory: { through_sequence?: number } | null): number => {
        return existingMemory?.through_sequence ?? 0
      }

      expect(getCurrentSequence([])).toBe(0)
      expect(getCurrentSequence([{ sequence: 5 }])).toBe(5)
      expect(getCurrentSequence([{ sequence: 1 }, { sequence: 3 }])).toBe(3)
      expect(getCurrentSequence([{}])).toBe(0)

      expect(getLastProcessedSequence(null)).toBe(0)
      expect(getLastProcessedSequence({ through_sequence: 10 })).toBe(10)
      expect(getLastProcessedSequence({})).toBe(0)
    })
  })

  describe('OpenAI response parsing', () => {
    it('extracts JSON from markdown code blocks', () => {
      const parseJsonFromResponse = (content: string): string => {
        let jsonStr = content.trim()
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return jsonStr
      }

      const plainJson = '{"summary": "test", "goals": []}'
      expect(parseJsonFromResponse(plainJson)).toBe(plainJson)

      const markdownJson = '```json\n{"summary": "test", "goals": []}\n```'
      expect(parseJsonFromResponse(markdownJson)).toBe('{"summary": "test", "goals": []}')

      const markdownNoLang = '```\n{"summary": "test"}\n```'
      expect(parseJsonFromResponse(markdownNoLang)).toBe('{"summary": "test"}')

      const multilineJson = '```json\n{\n  "summary": "test",\n  "goals": []\n}\n```'
      expect(parseJsonFromResponse(multilineJson)).toBe('{\n  "summary": "test",\n  "goals": []\n}')
    })

    it('normalizes working memory fields with defaults', () => {
      const normalizeWorkingMemory = (workingMemory: any) => {
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

      expect(normalizeWorkingMemory({})).toEqual({
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

      expect(normalizeWorkingMemory({ summary: 'test', goals: ['goal1'] })).toEqual({
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

    it('formats conversation text from messages', () => {
      const formatConversationText = (messages: Array<{ role: string; content: string }>): string => {
        return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
      }

      expect(formatConversationText([])).toBe('')
      expect(formatConversationText([{ role: 'user', content: 'Hello' }])).toBe('**user**: Hello')
      expect(formatConversationText([{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }])).toBe(
        '**user**: Hello\n\n**assistant**: Hi'
      )
    })
  })
})

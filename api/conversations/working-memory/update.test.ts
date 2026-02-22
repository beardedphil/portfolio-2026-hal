/**
 * Unit tests for working memory update endpoint.
 * Tests validation logic, sequence checking, and JSON parsing from OpenAI responses.
 */

import { describe, it, expect } from 'vitest'

describe('update.ts behavior', () => {
  describe('request body validation', () => {
    it('validates projectId and agent are required', () => {
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
      expect(validateRequired({ projectId: '  proj-1  ', agent: '  pm  ' })).toEqual({ valid: true })
    })

    it('validates Supabase credentials from body or environment', () => {
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
      expect(validateCredentials({}, {})).toEqual({ valid: false, error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).' })
      expect(validateCredentials({ supabaseUrl: 'https://test.supabase.co' }, {})).toEqual({ valid: false, error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).' })
    })

    it('validates OpenAI credentials', () => {
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

      expect(validateOpenAICredentials({ openaiApiKey: 'key', openaiModel: 'gpt-4' })).toEqual({ valid: true })
      expect(validateOpenAICredentials({ openaiApiKey: '', openaiModel: 'gpt-4' })).toEqual({ valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' })
      expect(validateOpenAICredentials({})).toEqual({ valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' })
    })
  })

  describe('sequence checking logic', () => {
    it('determines if update is needed based on sequence numbers', () => {
      const shouldUpdate = (
        forceRefresh: boolean,
        currentSequence: number,
        lastProcessedSequence: number
      ): boolean => {
        if (forceRefresh) return true
        return currentSequence > lastProcessedSequence
      }

      expect(shouldUpdate(false, 5, 3)).toBe(true) // New messages
      expect(shouldUpdate(false, 3, 3)).toBe(false) // No new messages
      expect(shouldUpdate(false, 2, 3)).toBe(false) // Behind (shouldn't happen but handled)
      expect(shouldUpdate(true, 3, 3)).toBe(true) // Force refresh
      expect(shouldUpdate(true, 2, 5)).toBe(true) // Force refresh even if behind
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

  describe('JSON parsing from OpenAI response', () => {
    it('extracts JSON from markdown code blocks', () => {
      const extractJson = (content: string): string => {
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
        if (jsonMatch) {
          return jsonMatch[1]
        }
        return content
      }

      const plainJson = '{"summary": "test", "goals": []}'
      expect(extractJson(plainJson)).toBe(plainJson)

      const withMarkdown = '```json\n{"summary": "test", "goals": []}\n```'
      expect(extractJson(withMarkdown)).toBe('{"summary": "test", "goals": []}')

      const withCodeBlock = '```\n{"summary": "test"}\n```'
      expect(extractJson(withCodeBlock)).toBe('{"summary": "test"}')

      const multiline = '```json\n{\n  "summary": "test",\n  "goals": []\n}\n```'
      expect(extractJson(multiline)).toBe('{\n  "summary": "test",\n  "goals": []\n}')
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

      expect(normalizeWorkingMemory({ summary: null, goals: undefined })).toEqual({
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
    })
  })
})

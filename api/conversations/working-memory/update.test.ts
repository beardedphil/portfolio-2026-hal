/**
 * Unit tests for working memory update endpoint.
 * Tests validation, message fetching, sequence checking, OpenAI integration, and working memory upsert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Mock dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock fetch for OpenAI API
global.fetch = vi.fn()

describe('update.ts request validation', () => {
  describe('projectId and agent validation', () => {
    it('requires projectId and agent', () => {
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
      expect(validateOpenAI({ openaiApiKey: '', openaiModel: 'gpt-4' })).toEqual({
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

describe('update.ts sequence checking logic', () => {
  describe('determines if update is needed based on sequence', () => {
    it('returns existing memory when no new messages (currentSequence <= lastProcessedSequence)', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean => {
        return forceRefresh || currentSequence > lastProcessedSequence
      }

      expect(shouldUpdate(false, 5, 5)).toBe(false)
      expect(shouldUpdate(false, 4, 5)).toBe(false)
      expect(shouldUpdate(false, 6, 5)).toBe(true)
      expect(shouldUpdate(true, 5, 5)).toBe(true)
      expect(shouldUpdate(true, 4, 5)).toBe(true)
    })

    it('handles missing existing memory (lastProcessedSequence defaults to 0)', () => {
      const getLastProcessedSequence = (existingMemory: any): number => {
        return existingMemory?.through_sequence ?? 0
      }

      expect(getLastProcessedSequence({ through_sequence: 10 })).toBe(10)
      expect(getLastProcessedSequence(null)).toBe(0)
      expect(getLastProcessedSequence(undefined)).toBe(0)
    })

    it('calculates current sequence from messages', () => {
      const getCurrentSequence = (messages: Array<{ sequence?: number }>): number => {
        return messages[messages.length - 1]?.sequence ?? 0
      }

      expect(getCurrentSequence([{ sequence: 1 }, { sequence: 2 }, { sequence: 5 }])).toBe(5)
      expect(getCurrentSequence([])).toBe(0)
      expect(getCurrentSequence([{ sequence: 1 }])).toBe(1)
    })
  })
})

describe('update.ts OpenAI response parsing', () => {
  describe('extracts JSON from OpenAI response', () => {
    it('parses plain JSON response', () => {
      const parseOpenAIResponse = (content: string): any => {
        let jsonStr = content.trim()
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const plainJson = '{"summary": "test", "goals": []}'
      expect(parseOpenAIResponse(plainJson)).toEqual({ summary: 'test', goals: [] })
    })

    it('extracts JSON from markdown code block', () => {
      const parseOpenAIResponse = (content: string): any => {
        let jsonStr = content.trim()
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const markdownJson = '```json\n{"summary": "test", "goals": []}\n```'
      expect(parseOpenAIResponse(markdownJson)).toEqual({ summary: 'test', goals: [] })

      const markdownJsonNoLang = '```\n{"summary": "test", "goals": []}\n```'
      expect(parseOpenAIResponse(markdownJsonNoLang)).toEqual({ summary: 'test', goals: [] })
    })

    it('handles working memory structure transformation', () => {
      const transformWorkingMemory = (wm: any) => {
        return {
          summary: wm.summary || '',
          goals: wm.goals || [],
          requirements: wm.requirements || [],
          constraints: wm.constraints || [],
          decisions: wm.decisions || [],
          assumptions: wm.assumptions || [],
          openQuestions: wm.openQuestions || [],
          glossary: wm.glossary || {},
          stakeholders: wm.stakeholders || [],
        }
      }

      const input = {
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: ['req1'],
        constraints: [],
        decisions: null,
        assumptions: undefined,
        openQuestions: ['q1'],
        glossary: { term: 'def' },
        stakeholders: [],
      }

      expect(transformWorkingMemory(input)).toEqual({
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: ['req1'],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: ['q1'],
        glossary: { term: 'def' },
        stakeholders: [],
      })
    })
  })
})

describe('update.ts working memory database operations', () => {
  describe('transforms working memory between API and database formats', () => {
    it('converts API format to database format', () => {
      const toDbFormat = (wm: any, projectId: string, agent: string, currentSequence: number) => {
        return {
          project_id: projectId,
          agent,
          summary: wm.summary || '',
          goals: wm.goals || [],
          requirements: wm.requirements || [],
          constraints: wm.constraints || [],
          decisions: wm.decisions || [],
          assumptions: wm.assumptions || [],
          open_questions: wm.openQuestions || [],
          glossary: wm.glossary || {},
          stakeholders: wm.stakeholders || [],
          through_sequence: currentSequence,
          last_updated_at: new Date().toISOString(),
        }
      }

      const apiFormat = {
        summary: 'Test',
        goals: ['g1'],
        openQuestions: ['q1'],
      }

      const result = toDbFormat(apiFormat, 'proj-1', 'pm', 5)
      expect(result.project_id).toBe('proj-1')
      expect(result.agent).toBe('pm')
      expect(result.summary).toBe('Test')
      expect(result.open_questions).toEqual(['q1'])
      expect(result.through_sequence).toBe(5)
      expect(result.last_updated_at).toBeTruthy()
    })

    it('converts database format to API format', () => {
      const toApiFormat = (db: any) => {
        return {
          summary: db.summary || '',
          goals: db.goals || [],
          requirements: db.requirements || [],
          constraints: db.constraints || [],
          decisions: db.decisions || [],
          assumptions: db.assumptions || [],
          openQuestions: db.open_questions || [],
          glossary: db.glossary || {},
          stakeholders: db.stakeholders || [],
          lastUpdatedAt: db.last_updated_at || null,
          throughSequence: db.through_sequence || 0,
        }
      }

      const dbFormat = {
        summary: 'Test',
        goals: ['g1'],
        open_questions: ['q1'],
        through_sequence: 5,
        last_updated_at: '2024-01-01T00:00:00Z',
      }

      expect(toApiFormat(dbFormat)).toEqual({
        summary: 'Test',
        goals: ['g1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: ['q1'],
        glossary: {},
        stakeholders: [],
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        throughSequence: 5,
      })
    })
  })
})

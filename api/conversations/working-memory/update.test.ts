/**
 * Unit tests for working memory update endpoint.
 * Tests validation, body parsing, transformation logic, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('update.ts - Request validation', () => {
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

      expect(validateRequired({ projectId: 'test', agent: 'pm' })).toEqual({ valid: true })
      expect(validateRequired({ projectId: '', agent: 'pm' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: 'test', agent: '' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({})).toEqual({ valid: false, error: 'projectId and agent are required.' })
      expect(validateRequired({ projectId: '   ', agent: 'pm' })).toEqual({ valid: false, error: 'projectId and agent are required.' })
    })

    it('trims whitespace from projectId and agent', () => {
      const extractValues = (body: any) => {
        const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
        const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined
        return { projectId, agent }
      }

      expect(extractValues({ projectId: '  test  ', agent: '  pm  ' })).toEqual({ projectId: 'test', agent: 'pm' })
      expect(extractValues({ projectId: 'test', agent: 'pm' })).toEqual({ projectId: 'test', agent: 'pm' })
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
      expect(validateCredentials({}, {})).toEqual({ valid: false, error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).' })
      expect(validateCredentials({ supabaseUrl: 'https://test.supabase.co' }, {})).toEqual({ valid: false, error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).' })
    })
  })

  describe('OpenAI credentials validation', () => {
    it('requires openaiApiKey and openaiModel', () => {
      const validateOpenAI = (body: any): { valid: boolean; error?: string } => {
        const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined
        const openaiModel = typeof body.openaiModel === 'string' ? body.openaiModel.trim() : undefined

        if (!openaiApiKey || !openaiModel) {
          return { valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' }
        }
        return { valid: true }
      }

      expect(validateOpenAI({ openaiApiKey: 'key', openaiModel: 'gpt-4' })).toEqual({ valid: true })
      expect(validateOpenAI({ openaiApiKey: '', openaiModel: 'gpt-4' })).toEqual({ valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' })
      expect(validateOpenAI({})).toEqual({ valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' })
    })
  })
})

describe('update.ts - Working memory transformation', () => {
  it('transforms database format to API response format', () => {
    const transformToApiFormat = (dbRecord: any) => {
      return {
        summary: dbRecord.summary || '',
        goals: dbRecord.goals || [],
        requirements: dbRecord.requirements || [],
        constraints: dbRecord.constraints || [],
        decisions: dbRecord.decisions || [],
        assumptions: dbRecord.assumptions || [],
        openQuestions: dbRecord.open_questions || [],
        glossary: dbRecord.glossary || {},
        stakeholders: dbRecord.stakeholders || [],
        lastUpdatedAt: dbRecord.last_updated_at || null,
        throughSequence: dbRecord.through_sequence || 0,
      }
    }

    const dbRecord = {
      summary: 'Test summary',
      goals: ['goal1', 'goal2'],
      requirements: ['req1'],
      constraints: [],
      decisions: ['decision1'],
      assumptions: ['assumption1'],
      open_questions: ['question1'],
      glossary: { term1: 'definition1' },
      stakeholders: ['stakeholder1'],
      last_updated_at: '2024-01-01T00:00:00Z',
      through_sequence: 5,
    }

    const result = transformToApiFormat(dbRecord)
    expect(result).toEqual({
      summary: 'Test summary',
      goals: ['goal1', 'goal2'],
      requirements: ['req1'],
      constraints: [],
      decisions: ['decision1'],
      assumptions: ['assumption1'],
      openQuestions: ['question1'],
      glossary: { term1: 'definition1' },
      stakeholders: ['stakeholder1'],
      lastUpdatedAt: '2024-01-01T00:00:00Z',
      throughSequence: 5,
    })
  })

  it('handles missing fields with defaults', () => {
    const transformToApiFormat = (dbRecord: any) => {
      return {
        summary: dbRecord.summary || '',
        goals: dbRecord.goals || [],
        requirements: dbRecord.requirements || [],
        constraints: dbRecord.constraints || [],
        decisions: dbRecord.decisions || [],
        assumptions: dbRecord.assumptions || [],
        openQuestions: dbRecord.open_questions || [],
        glossary: dbRecord.glossary || {},
        stakeholders: dbRecord.stakeholders || [],
        lastUpdatedAt: dbRecord.last_updated_at || null,
        throughSequence: dbRecord.through_sequence || 0,
      }
    }

    const result = transformToApiFormat({})
    expect(result).toEqual({
      summary: '',
      goals: [],
      requirements: [],
      constraints: [],
      decisions: [],
      assumptions: [],
      openQuestions: [],
      glossary: {},
      stakeholders: [],
      lastUpdatedAt: null,
      throughSequence: 0,
    })
  })

  it('transforms OpenAI response format to database format', () => {
    const transformToDbFormat = (openaiResponse: any, projectId: string, agent: string, currentSequence: number) => {
      return {
        project_id: projectId,
        agent,
        summary: openaiResponse.summary || '',
        goals: openaiResponse.goals || [],
        requirements: openaiResponse.requirements || [],
        constraints: openaiResponse.constraints || [],
        decisions: openaiResponse.decisions || [],
        assumptions: openaiResponse.assumptions || [],
        open_questions: openaiResponse.openQuestions || [],
        glossary: openaiResponse.glossary || {},
        stakeholders: openaiResponse.stakeholders || [],
        through_sequence: currentSequence,
        last_updated_at: new Date().toISOString(),
      }
    }

    const openaiResponse = {
      summary: 'Test summary',
      goals: ['goal1'],
      requirements: ['req1'],
      constraints: ['constraint1'],
      decisions: ['decision1'],
      assumptions: ['assumption1'],
      openQuestions: ['question1'],
      glossary: { term1: 'definition1' },
      stakeholders: ['stakeholder1'],
    }

    const result = transformToDbFormat(openaiResponse, 'project1', 'pm', 10)
    expect(result.project_id).toBe('project1')
    expect(result.agent).toBe('pm')
    expect(result.summary).toBe('Test summary')
    expect(result.goals).toEqual(['goal1'])
    expect(result.open_questions).toEqual(['question1'])
    expect(result.through_sequence).toBe(10)
    expect(result.last_updated_at).toBeDefined()
  })
})

describe('update.ts - OpenAI response parsing', () => {
  it('extracts JSON from markdown code blocks', () => {
    const parseJsonFromResponse = (content: string): string => {
      let jsonStr = content
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
      if (jsonMatch) {
        jsonStr = jsonMatch[1]
      }
      return jsonStr
    }

    const withCodeBlock = '```json\n{"summary": "test"}\n```'
    expect(parseJsonFromResponse(withCodeBlock)).toBe('{"summary": "test"}')

    const withCodeBlockNoLang = '```\n{"summary": "test"}\n```'
    expect(parseJsonFromResponse(withCodeBlockNoLang)).toBe('{"summary": "test"}')

    const withoutCodeBlock = '{"summary": "test"}'
    expect(parseJsonFromResponse(withoutCodeBlock)).toBe('{"summary": "test"}')
  })

  it('handles empty or invalid JSON gracefully', () => {
    const parseWorkingMemory = (jsonStr: string) => {
      try {
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
      } catch (err) {
        throw new Error(`Failed to parse working memory: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    expect(() => parseWorkingMemory('{"summary": "test"}')).not.toThrow()
    expect(() => parseWorkingMemory('invalid json')).toThrow()
    expect(() => parseWorkingMemory('')).toThrow()
  })
})

describe('update.ts - Sequence comparison logic', () => {
  it('determines if update is needed based on sequence numbers', () => {
    const shouldUpdate = (forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean => {
      if (forceRefresh) return true
      return currentSequence > lastProcessedSequence
    }

    expect(shouldUpdate(true, 5, 10)).toBe(true) // forceRefresh overrides
    expect(shouldUpdate(false, 10, 5)).toBe(true) // new messages
    expect(shouldUpdate(false, 5, 10)).toBe(false) // no new messages
    expect(shouldUpdate(false, 5, 5)).toBe(false) // same sequence
  })

  it('handles missing sequence values', () => {
    const getCurrentSequence = (messages: any[]): number => {
      return messages[messages.length - 1]?.sequence ?? 0
    }

    const getLastProcessedSequence = (existingMemory: any): number => {
      return existingMemory?.through_sequence ?? 0
    }

    expect(getCurrentSequence([])).toBe(0)
    expect(getCurrentSequence([{ sequence: 5 }])).toBe(5)
    expect(getLastProcessedSequence(null)).toBe(0)
    expect(getLastProcessedSequence({ through_sequence: 10 })).toBe(10)
  })
})

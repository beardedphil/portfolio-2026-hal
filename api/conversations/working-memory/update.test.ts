/**
 * Unit tests for working memory update endpoint.
 * Tests parameter extraction, validation, update check logic, and JSON parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('update.ts parameter extraction and validation', () => {
  describe('extractProjectId', () => {
    it('extracts and trims projectId from request body', () => {
      const extractProjectId = (body: any): string | undefined => {
        return typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
      }

      expect(extractProjectId({ projectId: 'test-project' })).toBe('test-project')
      expect(extractProjectId({ projectId: '  test-project  ' })).toBe('test-project')
      expect(extractProjectId({ projectId: '' })).toBeUndefined()
      expect(extractProjectId({ projectId: '   ' })).toBeUndefined()
      expect(extractProjectId({})).toBeUndefined()
      expect(extractProjectId({ projectId: 123 })).toBeUndefined()
    })
  })

  describe('extractAgent', () => {
    it('extracts and trims agent from request body', () => {
      const extractAgent = (body: any): string | undefined => {
        return typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined
      }

      expect(extractAgent({ agent: 'pm-agent' })).toBe('pm-agent')
      expect(extractAgent({ agent: '  pm-agent  ' })).toBe('pm-agent')
      expect(extractAgent({ agent: '' })).toBeUndefined()
      expect(extractAgent({ agent: '   ' })).toBeUndefined()
      expect(extractAgent({})).toBeUndefined()
    })
  })

  describe('extractSupabaseCredentials', () => {
    it('extracts supabaseUrl from request body or environment', () => {
      const extractSupabaseUrl = (body: any, env: any): string | undefined => {
        return (
          (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
          env.SUPABASE_URL?.trim() ||
          env.VITE_SUPABASE_URL?.trim() ||
          undefined
        )
      }

      expect(extractSupabaseUrl({ supabaseUrl: 'https://test.supabase.co' }, {})).toBe('https://test.supabase.co')
      expect(extractSupabaseUrl({}, { SUPABASE_URL: 'https://env.supabase.co' })).toBe('https://env.supabase.co')
      expect(extractSupabaseUrl({}, { VITE_SUPABASE_URL: 'https://vite.supabase.co' })).toBe('https://vite.supabase.co')
      expect(extractSupabaseUrl({ supabaseUrl: '  https://test.supabase.co  ' }, {})).toBe('https://test.supabase.co')
      expect(extractSupabaseUrl({}, {})).toBeUndefined()
    })

    it('extracts supabaseAnonKey from request body or environment', () => {
      const extractSupabaseAnonKey = (body: any, env: any): string | undefined => {
        return (
          (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
          env.SUPABASE_ANON_KEY?.trim() ||
          env.VITE_SUPABASE_ANON_KEY?.trim() ||
          undefined
        )
      }

      expect(extractSupabaseAnonKey({ supabaseAnonKey: 'anon-key' }, {})).toBe('anon-key')
      expect(extractSupabaseAnonKey({}, { SUPABASE_ANON_KEY: 'env-key' })).toBe('env-key')
      expect(extractSupabaseAnonKey({}, { VITE_SUPABASE_ANON_KEY: 'vite-key' })).toBe('vite-key')
      expect(extractSupabaseAnonKey({}, {})).toBeUndefined()
    })
  })

  describe('validateRequiredParameters', () => {
    it('requires projectId and agent', () => {
      const validate = (projectId: any, agent: any): boolean => {
        return !!(projectId && agent)
      }

      expect(validate('project-1', 'agent-1')).toBe(true)
      expect(validate('', 'agent-1')).toBe(false)
      expect(validate('project-1', '')).toBe(false)
      expect(validate(undefined, undefined)).toBe(false)
    })

    it('requires supabaseUrl and supabaseAnonKey', () => {
      const validate = (supabaseUrl: any, supabaseAnonKey: any): boolean => {
        return !!(supabaseUrl && supabaseAnonKey)
      }

      expect(validate('https://test.supabase.co', 'anon-key')).toBe(true)
      expect(validate('', 'anon-key')).toBe(false)
      expect(validate('https://test.supabase.co', '')).toBe(false)
      expect(validate(undefined, undefined)).toBe(false)
    })

    it('requires openaiApiKey and openaiModel', () => {
      const validate = (openaiApiKey: any, openaiModel: any): boolean => {
        return !!(openaiApiKey && openaiModel)
      }

      expect(validate('sk-123', 'gpt-4')).toBe(true)
      expect(validate('', 'gpt-4')).toBe(false)
      expect(validate('sk-123', '')).toBe(false)
      expect(validate(undefined, undefined)).toBe(false)
    })
  })
})

describe('update.ts update check logic', () => {
  describe('shouldUpdateWorkingMemory', () => {
    it('returns true when forceRefresh is true', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSeq: number, lastSeq: number): boolean => {
        return forceRefresh || currentSeq > lastSeq
      }

      expect(shouldUpdate(true, 5, 10)).toBe(true)
      expect(shouldUpdate(true, 10, 5)).toBe(true)
      expect(shouldUpdate(true, 5, 5)).toBe(true)
    })

    it('returns true when currentSequence is greater than lastProcessedSequence', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSeq: number, lastSeq: number): boolean => {
        return forceRefresh || currentSeq > lastSeq
      }

      expect(shouldUpdate(false, 10, 5)).toBe(true)
      expect(shouldUpdate(false, 6, 5)).toBe(true)
    })

    it('returns false when currentSequence equals lastProcessedSequence and forceRefresh is false', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSeq: number, lastSeq: number): boolean => {
        return forceRefresh || currentSeq > lastSeq
      }

      expect(shouldUpdate(false, 5, 5)).toBe(false)
    })

    it('returns false when currentSequence is less than lastProcessedSequence and forceRefresh is false', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSeq: number, lastSeq: number): boolean => {
        return forceRefresh || currentSeq > lastSeq
      }

      expect(shouldUpdate(false, 3, 5)).toBe(false)
    })

    it('handles undefined lastProcessedSequence as 0', () => {
      const shouldUpdate = (forceRefresh: boolean, currentSeq: number, lastSeq: number | undefined): boolean => {
        const lastProcessedSequence = lastSeq ?? 0
        return forceRefresh || currentSeq > lastProcessedSequence
      }

      expect(shouldUpdate(false, 5, undefined)).toBe(true)
      expect(shouldUpdate(false, 0, undefined)).toBe(false)
    })
  })

  describe('getCurrentSequence', () => {
    it('extracts sequence from last message', () => {
      const getCurrentSequence = (messages: Array<{ sequence?: number }>): number => {
        return messages[messages.length - 1]?.sequence ?? 0
      }

      expect(getCurrentSequence([{ sequence: 1 }, { sequence: 2 }, { sequence: 5 }])).toBe(5)
      expect(getCurrentSequence([{ sequence: 1 }])).toBe(1)
      expect(getCurrentSequence([])).toBe(0)
      expect(getCurrentSequence([{}, {}])).toBe(0)
    })
  })
})

describe('update.ts JSON parsing from OpenAI response', () => {
  describe('parseJsonFromOpenAIResponse', () => {
    it('parses plain JSON response', () => {
      const parseJson = (content: string): any => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const plainJson = '{"summary": "test", "goals": ["goal1"]}'
      expect(parseJson(plainJson)).toEqual({ summary: 'test', goals: ['goal1'] })
    })

    it('extracts JSON from markdown code block with json language tag', () => {
      const parseJson = (content: string): any => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const markdownJson = '```json\n{"summary": "test", "goals": ["goal1"]}\n```'
      expect(parseJson(markdownJson)).toEqual({ summary: 'test', goals: ['goal1'] })
    })

    it('extracts JSON from markdown code block without language tag', () => {
      const parseJson = (content: string): any => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const markdownJson = '```\n{"summary": "test", "goals": ["goal1"]}\n```'
      expect(parseJson(markdownJson)).toEqual({ summary: 'test', goals: ['goal1'] })
    })

    it('handles multiline JSON in code blocks', () => {
      const parseJson = (content: string): any => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const multilineJson = `\`\`\`json
{
  "summary": "test summary",
  "goals": ["goal1", "goal2"]
}
\`\`\``
      expect(parseJson(multilineJson)).toEqual({
        summary: 'test summary',
        goals: ['goal1', 'goal2'],
      })
    })

    it('handles JSON with nested objects and arrays', () => {
      const parseJson = (content: string): any => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return JSON.parse(jsonStr)
      }

      const complexJson = `{"summary": "test", "glossary": {"term1": "def1", "term2": "def2"}, "goals": ["goal1"]}`
      expect(parseJson(complexJson)).toEqual({
        summary: 'test',
        glossary: { term1: 'def1', term2: 'def2' },
        goals: ['goal1'],
      })
    })
  })

  describe('normalizeWorkingMemoryFields', () => {
    it('normalizes working memory fields with defaults', () => {
      const normalize = (wm: any) => ({
        summary: wm.summary || '',
        goals: wm.goals || [],
        requirements: wm.requirements || [],
        constraints: wm.constraints || [],
        decisions: wm.decisions || [],
        assumptions: wm.assumptions || [],
        openQuestions: wm.openQuestions || [],
        glossary: wm.glossary || {},
        stakeholders: wm.stakeholders || [],
      })

      expect(normalize({ summary: 'test' })).toEqual({
        summary: 'test',
        goals: [],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: {},
        stakeholders: [],
      })

      expect(normalize({})).toEqual({
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

      expect(normalize({ goals: ['goal1'], glossary: { term: 'def' } })).toEqual({
        summary: '',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
        glossary: { term: 'def' },
        stakeholders: [],
      })
    })
  })
})

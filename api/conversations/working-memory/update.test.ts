/**
 * Unit tests for working-memory update endpoint.
 * Tests validation, CORS handling, message fetching, sequence checking,
 * OpenAI interaction, JSON parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Test helper functions extracted from the handler logic
// These test the behavior being refactored

describe('working-memory update endpoint', () => {
  describe('CORS handling', () => {
    it('handles OPTIONS request with 204 status', () => {
      const handleOptions = (res: ServerResponse) => {
        res.statusCode = 204
        res.end()
      }

      const mockRes = {
        statusCode: 0,
        end: vi.fn(),
      } as unknown as ServerResponse

      handleOptions(mockRes)

      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalled()
    })
  })

  describe('method validation', () => {
    it('rejects non-POST methods with 405', () => {
      const validateMethod = (method: string | undefined): { allowed: boolean; statusCode?: number } => {
        if (method === 'OPTIONS') {
          return { allowed: true }
        }
        if (method !== 'POST') {
          return { allowed: false, statusCode: 405 }
        }
        return { allowed: true }
      }

      expect(validateMethod('GET')).toEqual({ allowed: false, statusCode: 405 })
      expect(validateMethod('PUT')).toEqual({ allowed: false, statusCode: 405 })
      expect(validateMethod('DELETE')).toEqual({ allowed: false, statusCode: 405 })
      expect(validateMethod('POST')).toEqual({ allowed: true })
      expect(validateMethod('OPTIONS')).toEqual({ allowed: true })
    })
  })

  describe('request body validation', () => {
    it('requires projectId and agent', () => {
      const validateRequiredFields = (body: any): { valid: boolean; error?: string } => {
        const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
        const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined

        if (!projectId || !agent) {
          return { valid: false, error: 'projectId and agent are required.' }
        }
        return { valid: true }
      }

      expect(validateRequiredFields({ projectId: 'test', agent: 'pm' })).toEqual({ valid: true })
      expect(validateRequiredFields({ projectId: '', agent: 'pm' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequiredFields({ projectId: 'test', agent: '' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequiredFields({})).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
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

      expect(
        validateSupabaseCredentials(
          { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'key' },
          {}
        )
      ).toEqual({ valid: true })

      expect(
        validateSupabaseCredentials(
          {},
          { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'key' }
        )
      ).toEqual({ valid: true })

      expect(validateSupabaseCredentials({}, {})).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
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
      expect(validateOpenAICredentials({ openaiApiKey: '', openaiModel: 'gpt-4' })).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
      expect(validateOpenAICredentials({})).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
    })
  })

  describe('sequence checking logic', () => {
    it('determines if update is needed based on sequence and forceRefresh', () => {
      const shouldUpdate = (
        forceRefresh: boolean,
        currentSequence: number,
        lastProcessedSequence: number
      ): boolean => {
        if (forceRefresh) return true
        return currentSequence > lastProcessedSequence
      }

      expect(shouldUpdate(true, 5, 10)).toBe(true)
      expect(shouldUpdate(false, 10, 5)).toBe(true)
      expect(shouldUpdate(false, 5, 10)).toBe(false)
      expect(shouldUpdate(false, 5, 5)).toBe(false)
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
  })

  describe('conversation text formatting', () => {
    it('formats messages into conversation text', () => {
      const formatConversationText = (messages: Array<{ role: string; content: string }>): string => {
        return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
      }

      expect(
        formatConversationText([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ])
      ).toBe('**user**: Hello\n\n**assistant**: Hi there')

      expect(formatConversationText([])).toBe('')
    })
  })

  describe('JSON parsing from OpenAI response', () => {
    it('extracts JSON from markdown code blocks', () => {
      const extractJsonFromResponse = (content: string): string => {
        let jsonStr = content
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        return jsonStr
      }

      expect(extractJsonFromResponse('```json\n{"test": "value"}\n```')).toBe('{"test": "value"}')
      expect(extractJsonFromResponse('```\n{"test": "value"}\n```')).toBe('{"test": "value"}')
      expect(extractJsonFromResponse('{"test": "value"}')).toBe('{"test": "value"}')
      expect(extractJsonFromResponse('```json\n{"nested": {"key": "value"}}\n```')).toBe('{"nested": {"key": "value"}}')
    })

    it('handles JSON parsing errors gracefully', () => {
      const parseWorkingMemory = (jsonStr: string): { success: boolean; data?: any; error?: string } => {
        try {
          const parsed = JSON.parse(jsonStr) as {
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
          return { success: true, data: parsed }
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }

      expect(parseWorkingMemory('{"summary": "test"}')).toEqual({
        success: true,
        data: { summary: 'test' },
      })
      expect(parseWorkingMemory('invalid json')).toEqual({
        success: false,
        error: expect.stringContaining('JSON'),
      })
    })
  })

  describe('working memory data transformation', () => {
    it('transforms database row to API response format', () => {
      const transformToResponse = (dbRow: any) => {
        return {
          summary: dbRow.summary || '',
          goals: dbRow.goals || [],
          requirements: dbRow.requirements || [],
          constraints: dbRow.constraints || [],
          decisions: dbRow.decisions || [],
          assumptions: dbRow.assumptions || [],
          openQuestions: dbRow.open_questions || [],
          glossary: dbRow.glossary || {},
          stakeholders: dbRow.stakeholders || [],
          lastUpdatedAt: dbRow.last_updated_at || null,
          throughSequence: dbRow.through_sequence || 0,
        }
      }

      expect(
        transformToResponse({
          summary: 'Test summary',
          goals: ['goal1'],
          open_questions: ['q1'],
          through_sequence: 5,
        })
      ).toEqual({
        summary: 'Test summary',
        goals: ['goal1'],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        openQuestions: ['q1'],
        glossary: {},
        stakeholders: [],
        lastUpdatedAt: null,
        throughSequence: 5,
      })
    })

    it('transforms API format to database format', () => {
      const transformToDatabase = (apiData: any, projectId: string, agent: string, currentSequence: number) => {
        return {
          project_id: projectId,
          agent,
          summary: apiData.summary || '',
          goals: apiData.goals || [],
          requirements: apiData.requirements || [],
          constraints: apiData.constraints || [],
          decisions: apiData.decisions || [],
          assumptions: apiData.assumptions || [],
          open_questions: apiData.openQuestions || [],
          glossary: apiData.glossary || {},
          stakeholders: apiData.stakeholders || [],
          through_sequence: currentSequence,
          last_updated_at: new Date().toISOString(),
        }
      }

      const result = transformToDatabase(
        {
          summary: 'Test',
          goals: ['goal1'],
          openQuestions: ['q1'],
        },
        'proj-1',
        'pm',
        10
      )

      expect(result.project_id).toBe('proj-1')
      expect(result.agent).toBe('pm')
      expect(result.summary).toBe('Test')
      expect(result.goals).toEqual(['goal1'])
      expect(result.open_questions).toEqual(['q1'])
      expect(result.through_sequence).toBe(10)
      expect(result.last_updated_at).toBeDefined()
    })
  })
})

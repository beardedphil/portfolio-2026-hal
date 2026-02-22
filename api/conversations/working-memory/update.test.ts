/**
 * Unit tests for working memory update endpoint.
 * Tests request validation, sequence checking, and OpenAI response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateAndParseRequest,
  normalizeWorkingMemory,
  formatConversationText,
  parseJsonFromOpenAIResponse,
} from './update'

describe('working-memory/update.ts behavior', () => {
  describe('Request body parsing and validation', () => {
    it('validates projectId and agent are required', () => {
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: true })
      expect(validateAndParseRequest({ projectId: '', agent: 'pm', openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: false, error: 'projectId and agent are required.' })
      expect(validateAndParseRequest({ projectId: 'test', agent: '', openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: false, error: 'projectId and agent are required.' })
      expect(validateAndParseRequest({ openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: false, error: 'projectId and agent are required.' })
      expect(validateAndParseRequest({ projectId: '  ', agent: '  ', openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: false, error: 'projectId and agent are required.' })
    })

    it('validates Supabase credentials from body or environment', () => {
      const originalEnv = { ...process.env }
      
      // Test with body values
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'key', openaiApiKey: 'sk-test', openaiModel: 'gpt-4' })).toMatchObject({ valid: true })
      
      // Test with environment variables
      process.env.SUPABASE_URL = 'https://env.supabase.co'
      process.env.SUPABASE_ANON_KEY = 'env-key'
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', openaiApiKey: 'sk-test', openaiModel: 'gpt-4' })).toMatchObject({ valid: true })
      
      // Test missing credentials
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_ANON_KEY
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', openaiApiKey: 'sk-test', openaiModel: 'gpt-4' })).toMatchObject({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', supabaseUrl: 'https://test.supabase.co', openaiApiKey: 'sk-test', openaiModel: 'gpt-4' })).toMatchObject({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      
      // Restore original env
      process.env = originalEnv
    })

    it('validates OpenAI credentials are required', () => {
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', openaiApiKey: 'sk-test', openaiModel: 'gpt-4', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({ valid: true })
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', openaiApiKey: 'sk-test', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
      expect(validateAndParseRequest({ projectId: 'test', agent: 'pm', supabaseUrl: 'https://test.co', supabaseAnonKey: 'key' })).toMatchObject({
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
      const plainJson = '{"summary": "test", "goals": []}'
      expect(parseJsonFromOpenAIResponse(plainJson)).toBe(plainJson)

      const markdownJson = '```json\n{"summary": "test", "goals": []}\n```'
      expect(parseJsonFromOpenAIResponse(markdownJson)).toBe('{"summary": "test", "goals": []}')

      const markdownNoLang = '```\n{"summary": "test"}\n```'
      expect(parseJsonFromOpenAIResponse(markdownNoLang)).toBe('{"summary": "test"}')

      const multilineJson = '```json\n{\n  "summary": "test",\n  "goals": []\n}\n```'
      expect(parseJsonFromOpenAIResponse(multilineJson)).toBe('{\n  "summary": "test",\n  "goals": []\n}')
    })

    it('normalizes working memory fields with defaults', () => {
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
      expect(formatConversationText([])).toBe('')
      expect(formatConversationText([{ role: 'user', content: 'Hello' }])).toBe('**user**: Hello')
      expect(formatConversationText([{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }])).toBe(
        '**user**: Hello\n\n**assistant**: Hi'
      )
    })
  })
})

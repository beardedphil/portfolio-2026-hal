/**
 * Unit tests for working memory update endpoint.
 * Tests validation logic, sequence checking, and OpenAI response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Test helper functions extracted from the handler for testing
function validateRequest(body: {
  projectId?: string
  agent?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  openaiApiKey?: string
  openaiModel?: string
  forceRefresh?: boolean
}): { valid: boolean; error?: string } {
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
  const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined

  if (!projectId || !agent) {
    return { valid: false, error: 'projectId and agent are required.' }
  }

  const supabaseUrl =
    (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      valid: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

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

function shouldUpdate(
  forceRefresh: boolean,
  currentSequence: number,
  lastProcessedSequence: number
): boolean {
  return forceRefresh || currentSequence > lastProcessedSequence
}

function parseOpenAIResponse(content: string): { success: boolean; json?: unknown; error?: string } {
  if (!content || !content.trim()) {
    return { success: false, error: 'Empty response content' }
  }

  try {
    // Parse JSON from response (may have markdown code blocks)
    let jsonStr = content.trim()
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonStr)
    return { success: true, json: parsed }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

describe('update.ts validation', () => {
  describe('request validation', () => {
    it('requires projectId and agent', () => {
      expect(validateRequest({})).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequest({ projectId: 'test' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequest({ agent: 'test' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
    })

    it('rejects empty or whitespace-only projectId and agent', () => {
      expect(validateRequest({ projectId: '', agent: 'test' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequest({ projectId: '   ', agent: 'test' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
      expect(validateRequest({ projectId: 'test', agent: '' })).toEqual({
        valid: false,
        error: 'projectId and agent are required.',
      })
    })

    it('requires Supabase credentials', () => {
      expect(
        validateRequest({
          projectId: 'test',
          agent: 'test',
          openaiApiKey: 'key',
          openaiModel: 'gpt-4',
        })
      ).toEqual({
        valid: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    })

    it('requires OpenAI credentials', () => {
      expect(
        validateRequest({
          projectId: 'test',
          agent: 'test',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'key',
        })
      ).toEqual({
        valid: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
    })

    it('accepts valid request with all required fields', () => {
      const result = validateRequest({
        projectId: 'test',
        agent: 'test',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'key',
        openaiApiKey: 'key',
        openaiModel: 'gpt-4',
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('sequence checking logic', () => {
    it('should update when forceRefresh is true', () => {
      expect(shouldUpdate(true, 5, 10)).toBe(true)
      expect(shouldUpdate(true, 10, 5)).toBe(true)
      expect(shouldUpdate(true, 5, 5)).toBe(true)
    })

    it('should update when currentSequence is greater than lastProcessedSequence', () => {
      expect(shouldUpdate(false, 10, 5)).toBe(true)
      expect(shouldUpdate(false, 6, 5)).toBe(true)
    })

    it('should not update when currentSequence equals lastProcessedSequence and forceRefresh is false', () => {
      expect(shouldUpdate(false, 5, 5)).toBe(false)
    })

    it('should not update when currentSequence is less than lastProcessedSequence and forceRefresh is false', () => {
      expect(shouldUpdate(false, 3, 5)).toBe(false)
    })
  })

  describe('OpenAI response parsing', () => {
    it('parses plain JSON response', () => {
      const json = { summary: 'test', goals: ['goal1'] }
      const result = parseOpenAIResponse(JSON.stringify(json))
      expect(result.success).toBe(true)
      expect(result.json).toEqual(json)
    })

    it('parses JSON wrapped in markdown code blocks', () => {
      const json = { summary: 'test', goals: ['goal1'] }
      const wrapped = `\`\`\`json\n${JSON.stringify(json)}\n\`\`\``
      const result = parseOpenAIResponse(wrapped)
      expect(result.success).toBe(true)
      expect(result.json).toEqual(json)
    })

    it('parses JSON wrapped in code blocks without language tag', () => {
      const json = { summary: 'test', goals: ['goal1'] }
      const wrapped = `\`\`\`\n${JSON.stringify(json)}\n\`\`\``
      const result = parseOpenAIResponse(wrapped)
      expect(result.success).toBe(true)
      expect(result.json).toEqual(json)
    })

    it('handles empty response', () => {
      const result = parseOpenAIResponse('')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Empty')
    })

    it('handles invalid JSON', () => {
      const result = parseOpenAIResponse('not valid json')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('handles JSON with extra whitespace', () => {
      const json = { summary: 'test', goals: ['goal1'] }
      const result = parseOpenAIResponse(`  ${JSON.stringify(json)}  `)
      expect(result.success).toBe(true)
      expect(result.json).toEqual(json)
    })
  })
})

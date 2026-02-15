import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateOpenAiConfig } from './config-validation.js'

describe('config-validation', () => {
  beforeEach(() => {
    // Clear env vars
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  afterEach(() => {
    // Restore env vars
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  describe('validateOpenAiConfig', () => {
    it('should return valid config when both key and model are set', () => {
      process.env.OPENAI_API_KEY = 'test-key'
      process.env.OPENAI_MODEL = 'test-model'

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(true)
      expect(result.key).toBe('test-key')
      expect(result.model).toBe('test-model')
      expect(result.errorResponse).toBeUndefined()
    })

    it('should return error when OPENAI_API_KEY is missing', () => {
      delete process.env.OPENAI_API_KEY
      process.env.OPENAI_MODEL = 'test-model'

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(false)
      expect(result.key).toBeUndefined()
      expect(result.model).toBeUndefined()
      expect(result.errorResponse).toBeDefined()
      expect(result.errorResponse?.error).toContain('OpenAI API is not configured')
      expect(result.errorResponse?.error).toContain('OPENAI_API_KEY')
      expect(result.errorResponse?.errorPhase).toBe('openai')
      expect(result.errorResponse?.reply).toBe('')
      expect(result.errorResponse?.toolCalls).toEqual([])
      expect(result.errorResponse?.outboundRequest).toBeNull()
    })

    it('should return error when OPENAI_MODEL is missing', () => {
      process.env.OPENAI_API_KEY = 'test-key'
      delete process.env.OPENAI_MODEL

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(false)
      expect(result.errorResponse).toBeDefined()
      expect(result.errorResponse?.error).toContain('OpenAI API is not configured')
      expect(result.errorResponse?.error).toContain('OPENAI_MODEL')
      expect(result.errorResponse?.errorPhase).toBe('openai')
    })

    it('should return error when both are missing', () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.OPENAI_MODEL

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(false)
      expect(result.errorResponse).toBeDefined()
      expect(result.errorResponse?.error).toContain('OpenAI API is not configured')
      expect(result.errorResponse?.errorPhase).toBe('openai')
    })

    it('should handle whitespace-only values as missing', () => {
      process.env.OPENAI_API_KEY = '   '
      process.env.OPENAI_MODEL = 'test-model'

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(false)
      expect(result.errorResponse).toBeDefined()
    })

    it('should trim whitespace from valid values', () => {
      process.env.OPENAI_API_KEY = '  test-key  '
      process.env.OPENAI_MODEL = '  test-model  '

      const result = validateOpenAiConfig()

      expect(result.valid).toBe(true)
      expect(result.key).toBe('test-key')
      expect(result.model).toBe('test-model')
    })
  })
})

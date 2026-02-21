import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isAbortError,
  halFetchJson,
  buildFullPromptText,
  buildPromptForOpenAI,
} from './runPmAgentHelpers.js'

describe('runPmAgentHelpers', () => {
  describe('isAbortError', () => {
    it('should return true when abort signal is aborted', () => {
      const abortController = new AbortController()
      abortController.abort()
      const err = new Error('Test error')
      expect(isAbortError(err, abortController.signal)).toBe(true)
    })

    it('should return true for AbortError by name', () => {
      const err = { name: 'AbortError', message: 'Aborted' }
      expect(isAbortError(err)).toBe(true)
    })

    it('should return true for error message containing "abort"', () => {
      const err = new Error('Operation was aborted')
      expect(isAbortError(err)).toBe(true)
    })

    it('should return false for normal errors', () => {
      const err = new Error('Normal error')
      expect(isAbortError(err)).toBe(false)
    })
  })

  describe('halFetchJson', () => {
    beforeEach(() => {
      global.fetch = vi.fn()
    })

    it('should successfully fetch and parse JSON response', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true, data: 'test' }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const result = await halFetchJson(
        'https://test.com',
        '/api/test',
        { test: 'data' },
        { timeoutMs: 5000 }
      )

      expect(result.ok).toBe(true)
      expect(result.json.success).toBe(true)
      expect(result.json.data).toBe('test')
    })

    it('should handle non-JSON responses gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        headers: new Headers([['content-type', 'text/plain']]),
      }
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)

      const result = await halFetchJson(
        'https://test.com',
        '/api/test',
        {}
      )

      expect(result.ok).toBe(false)
      expect(result.json.error).toContain('Non-JSON response')
    })

    it('should call onProgress when provided', async () => {
      const mockResponse = {
        ok: true,
        text: async () => '{}',
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as any)
      const onProgress = vi.fn()

      await halFetchJson(
        'https://test.com',
        '/api/test',
        {},
        { progressMessage: 'Testing...', onProgress }
      )

      expect(onProgress).toHaveBeenCalledWith('Testing...')
    })
  })

  describe('buildFullPromptText', () => {
    it('should build prompt text without images', () => {
      const result = buildFullPromptText(
        'System instructions',
        'Context pack',
        'User message'
      )

      expect(result).toContain('System Instructions')
      expect(result).toContain('Context pack')
      expect(result).toContain('Respond to the user message above')
      expect(result).not.toContain('Images')
    })

    it('should include image info for vision models', () => {
      const result = buildFullPromptText(
        'System instructions',
        'Context pack',
        'User message',
        [{ filename: 'test.png', mimeType: 'image/png' }],
        'gpt-4o'
      )

      expect(result).toContain('Images (included in prompt)')
      expect(result).toContain('test.png')
    })

    it('should indicate ignored images for non-vision models', () => {
      const result = buildFullPromptText(
        'System instructions',
        'Context pack',
        'User message',
        [{ filename: 'test.png', mimeType: 'image/png' }],
        'gpt-4'
      )

      expect(result).toContain('Images (provided but ignored)')
      expect(result).toContain('gpt-4')
    })
  })

  describe('buildPromptForOpenAI', () => {
    it('should return string for non-vision models', () => {
      const result = buildPromptForOpenAI('Context pack', undefined, 'gpt-4')
      expect(typeof result).toBe('string')
      expect(result).toContain('Context pack')
    })

    it('should return array for vision models with images', () => {
      const result = buildPromptForOpenAI(
        'Context pack',
        [{ dataUrl: 'data:image/png;base64,test' }],
        'gpt-4o'
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).toHaveProperty('type', 'text')
      expect(result[1]).toHaveProperty('type', 'image')
    })

    it('should return string for vision models without images', () => {
      const result = buildPromptForOpenAI('Context pack', undefined, 'gpt-4o')
      expect(typeof result).toBe('string')
    })
  })
})

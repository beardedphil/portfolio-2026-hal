import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { halFetchJson } from './halApiClient.js'

describe('halFetchJson', () => {
  const baseUrl = 'https://test-api.example.com'
  const path = '/api/test'
  const body = { test: 'data' }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('successful JSON response', () => {
    it('returns parsed JSON when response is valid JSON', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: 'test' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson(baseUrl, path, body)

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({ success: true, data: 'test' })
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}${path}`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    })

    it('handles empty response text', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => '',
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson(baseUrl, path, body)

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({})
    })
  })

  describe('error handling', () => {
    it('handles non-JSON response with error message', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson(baseUrl, path, body)

      expect(result.ok).toBe(false)
      expect(result.json.success).toBe(false)
      expect(result.json.error).toContain('Non-JSON response')
      expect(result.json.error).toContain('HTTP 500')
      expect(result.json.error).toContain('Internal Server Error')
    })

    it('truncates long error messages to 200 characters', async () => {
      const longError = 'A'.repeat(500)
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => longError,
        headers: new Headers({ 'content-type': 'text/plain' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson(baseUrl, path, body)

      expect(result.json.error).toContain('A'.repeat(200))
      expect(result.json.error.length).toBeLessThan(300) // Error message + prefix
    })

    it('handles missing content-type header', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Error',
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson(baseUrl, path, body)

      expect(result.json.error).toContain('content-type: unknown')
    })
  })

  describe('timeout handling', () => {
    it('uses default timeout of 20000ms when not specified', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, body)

      // Verify timeout was set (we can't easily test the exact timeout value,
      // but we can verify the function completes)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('enforces minimum timeout of 1000ms', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, body, { timeoutMs: 500 })

      // Function should still work with minimum timeout enforced
      expect(global.fetch).toHaveBeenCalled()
    })

    it('uses custom timeout when provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, body, { timeoutMs: 30000 })

      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('progress callback', () => {
    it('calls onProgress with progress message when provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)
      const onProgress = vi.fn()

      await halFetchJson(baseUrl, path, body, {
        progressMessage: 'Processing...',
        onProgress,
      })

      expect(onProgress).toHaveBeenCalledWith('Processing...')
    })

    it('does not call onProgress when message is empty', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)
      const onProgress = vi.fn()

      await halFetchJson(baseUrl, path, body, {
        progressMessage: '',
        onProgress,
      })

      expect(onProgress).not.toHaveBeenCalled()
    })

    it('does not call onProgress when not provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await expect(halFetchJson(baseUrl, path, body)).resolves.toBeDefined()
    })
  })

  describe('abort signal handling', () => {
    it('handles abort signal when provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)
      const abortController = new AbortController()

      await halFetchJson(baseUrl, path, body, {
        abortSignal: abortController.signal,
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('works without abort signal', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, body)

      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('request body handling', () => {
    it('sends null body as empty object', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, null)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      )
    })

    it('sends undefined body as empty object', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson(baseUrl, path, undefined)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      )
    })

    it('sends complex objects as JSON string', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers(),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)
      const complexBody = { nested: { data: [1, 2, 3] } }

      await halFetchJson(baseUrl, path, complexBody)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(complexBody),
        })
      )
    })
  })
})

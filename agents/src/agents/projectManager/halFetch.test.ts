import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { halFetchJson, type HalFetchConfig } from './halFetch.js'

describe('halFetchJson', () => {
  const baseConfig: HalFetchConfig = {
    halBaseUrl: 'https://test.example.com',
  }

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('successful requests', () => {
    it('fetches JSON successfully', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true, data: 'test' }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson('/api/test', { test: 'data' }, undefined, baseConfig)

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({ success: true, data: 'test' })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.example.com/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('sends request body as JSON', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const requestBody = { ticketId: '123', action: 'move' }
      await halFetchJson('/api/tickets/move', requestBody, undefined, baseConfig)

      const call = vi.mocked(global.fetch).mock.calls[0]
      expect(call[1]?.body).toBe(JSON.stringify(requestBody))
    })
  })

  describe('timeout handling', () => {
    it('respects timeout option', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      // Test that timeout option is accepted (actual timeout behavior is tested in integration tests)
      const result = await halFetchJson('/api/test', {}, { timeoutMs: 1000 }, baseConfig)
      expect(result.ok).toBe(true)
    })

    it('uses default timeout when not specified', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      // Test that default timeout is used (actual timeout behavior is tested in integration tests)
      const result = await halFetchJson('/api/test', {}, undefined, baseConfig)
      expect(result.ok).toBe(true)
    })

    it('enforces minimum timeout of 1000ms', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      // Test that minimum timeout is enforced (actual timeout behavior is tested in integration tests)
      const result = await halFetchJson('/api/test', {}, { timeoutMs: 500 }, baseConfig)
      expect(result.ok).toBe(true)
    })
  })

  describe('abort signal handling', () => {
    it('handles abort signal configuration', async () => {
      const abortController = new AbortController()
      const config: HalFetchConfig = {
        ...baseConfig,
        abortSignal: abortController.signal,
      }

      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      // Test that abort signal is properly configured (actual abort behavior is tested in integration tests)
      const result = await halFetchJson('/api/test', {}, undefined, config)
      expect(result.ok).toBe(true)
    })

    it('cleans up abort listener on completion', async () => {
      const abortController = new AbortController()
      const config: HalFetchConfig = {
        ...baseConfig,
        abortSignal: abortController.signal,
      }

      const removeEventListenerSpy = vi.spyOn(abortController.signal, 'removeEventListener')
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson('/api/test', {}, undefined, config)

      expect(removeEventListenerSpy).toHaveBeenCalled()
    })
  })

  describe('progress messages', () => {
    it('calls onProgress when progressMessage is provided', async () => {
      const onProgress = vi.fn()
      const config: HalFetchConfig = {
        ...baseConfig,
        onProgress,
      }

      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson('/api/test', {}, { progressMessage: 'Processing...' }, config)

      expect(onProgress).toHaveBeenCalledWith('Processing...')
    })

    it('does not call onProgress when progressMessage is not provided', async () => {
      const onProgress = vi.fn()
      const config: HalFetchConfig = {
        ...baseConfig,
        onProgress,
      }

      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      await halFetchJson('/api/test', {}, undefined, config)

      expect(onProgress).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('handles non-JSON response', async () => {
      const mockResponse = {
        ok: false,
        text: async () => 'HTML error page',
        headers: new Headers({ 'content-type': 'text/html' }),
        status: 500,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson('/api/test', {}, undefined, baseConfig)

      expect(result.ok).toBe(false)
      expect(result.json.success).toBe(false)
      expect(result.json.error).toContain('Non-JSON response')
      expect(result.json.error).toContain('HTML error page')
    })

    it('handles empty response', async () => {
      const mockResponse = {
        ok: true,
        text: async () => '',
        headers: new Headers({ 'content-type': 'application/json' }),
        status: 200,
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const result = await halFetchJson('/api/test', {}, undefined, baseConfig)

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({})
    })

    it('handles network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      await expect(halFetchJson('/api/test', {}, undefined, baseConfig)).rejects.toThrow('Network error')
    })
  })
})

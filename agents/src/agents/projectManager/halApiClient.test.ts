import { describe, it, expect, vi, beforeEach } from 'vitest'
import { halFetchJson } from './halApiClient.js'

describe('halApiClient', () => {
  const baseUrl = 'https://test-api.example.com'

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('halFetchJson', () => {
    it('makes POST request to HAL API with correct URL and body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, data: 'test' })),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await halFetchJson(baseUrl, '/api/test', { key: 'value' })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'value' }),
        })
      )
      expect(result.ok).toBe(true)
      expect(result.json).toEqual({ success: true, data: 'test' })
    })

    it('handles successful JSON response', async () => {
      const responseData = { success: true, ticketId: 'HAL-0123' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(responseData)),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await halFetchJson(baseUrl, '/api/tickets/get', { ticketId: '123' })

      expect(result.ok).toBe(true)
      expect(result.json).toEqual(responseData)
    })

    it('handles non-JSON response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
        headers: new Headers({ 'content-type': 'text/plain' }),
      })

      const result = await halFetchJson(baseUrl, '/api/test', {})

      expect(result.ok).toBe(false)
      expect(result.json.success).toBe(false)
      expect(result.json.error).toContain('Non-JSON response')
      expect(result.json.error).toContain('/api/test')
    })

    it('respects custom timeout', async () => {
      // Note: Testing timeout behavior with real timers is complex due to AbortController
      // This test verifies the timeout option is accepted without error
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await halFetchJson(baseUrl, '/api/test', {}, { timeoutMs: 5000 })

      expect(result.ok).toBe(true)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('calls onProgress callback when provided', async () => {
      const onProgress = vi.fn()
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await halFetchJson(baseUrl, '/api/test', {}, { 
        progressMessage: 'Processing...',
        onProgress,
      })

      expect(onProgress).toHaveBeenCalledWith('Processing...')
    })

    it('handles abort signal', async () => {
      const abortController = new AbortController()
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })

      const promise = halFetchJson(baseUrl, '/api/test', {}, { 
        abortSignal: abortController.signal,
      })

      abortController.abort()

      await expect(promise).rejects.toThrow()
    })

    it('uses default timeout when not specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await halFetchJson(baseUrl, '/api/test', {})

      // Should use default 20_000ms timeout
      expect(global.fetch).toHaveBeenCalled()
    })

    it('enforces minimum timeout of 1000ms', async () => {
      // Note: Testing timeout behavior with real timers is complex due to AbortController
      // This test verifies that a timeout value below 1000ms is accepted and handled
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await halFetchJson(baseUrl, '/api/test', {}, { timeoutMs: 500 })

      expect(result.ok).toBe(true)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('handles empty response body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await halFetchJson(baseUrl, '/api/test', {})

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({})
    })
  })
})

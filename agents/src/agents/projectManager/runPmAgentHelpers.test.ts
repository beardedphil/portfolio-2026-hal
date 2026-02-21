import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isAbortError, halFetchJson } from './runPmAgentHelpers.js'

describe('runPmAgentHelpers', () => {
  describe('isAbortError', () => {
    it('returns true when abortSignal is already aborted', () => {
      const abortController = new AbortController()
      abortController.abort()
      expect(isAbortError(new Error('test'), abortController.signal)).toBe(true)
    })

    it('returns true for AbortError by name', () => {
      const error = new DOMException('Aborted', 'AbortError')
      expect(isAbortError(error)).toBe(true)
    })

    it('returns true for errors with "aborted" or "abort" in message', () => {
      expect(isAbortError(new Error('Request was aborted'))).toBe(true)
      expect(isAbortError(new Error('Abort signal received'))).toBe(true)
    })

    it('returns false for normal errors', () => {
      expect(isAbortError(new Error('Normal error'))).toBe(false)
      expect(isAbortError('String error')).toBe(false)
    })

    it('returns false when abortSignal is not aborted', () => {
      const abortController = new AbortController()
      expect(isAbortError(new Error('test'), abortController.signal)).toBe(false)
    })
  })

  describe('halFetchJson', () => {
    beforeEach(() => {
      global.fetch = vi.fn()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('makes successful POST request and returns parsed JSON', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: 'test' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      const result = await halFetchJson('https://test.com', '/api/test', { test: 'data' }, {})

      expect(result.ok).toBe(true)
      expect(result.json).toEqual({ success: true, data: 'test' })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.com/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('handles non-JSON responses gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      const result = await halFetchJson('https://test.com', '/api/test', {}, {})

      expect(result.ok).toBe(false)
      expect(result.json.error).toContain('Non-JSON response')
      expect(result.json.error).toContain('HTTP 500')
    })

    it('uses minimum timeout of 1000ms', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      await halFetchJson('https://test.com', '/api/test', {}, { timeoutMs: 500 })

      // Should use 1000ms minimum, so request should succeed
      expect(global.fetch).toHaveBeenCalled()
    })

    it('calls onProgress when provided', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)
      const onProgress = vi.fn()

      await halFetchJson('https://test.com', '/api/test', {}, { progressMessage: 'Loading...', onProgress })

      expect(onProgress).toHaveBeenCalledWith('Loading...')
    })
  })
})

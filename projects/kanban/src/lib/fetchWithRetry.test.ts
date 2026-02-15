import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from './fetchWithRetry'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('4xx errors (no retry)', () => {
    it.each([400, 401, 404, 499])('does not retry on %d status', async (status) => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status }))
      const result = await fetchWithRetry(fetchFn, 3, 1000)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(result.status).toBe(status)
    })
  })

  describe('5xx errors (retry)', () => {
    it.each([500, 502, 503])('retries on %d and eventually succeeds', async (status) => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
      const promise = fetchWithRetry(fetchFn, 3, 1000)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise
      expect(fetchFn).toHaveBeenCalledTimes(2)
      expect(result.status).toBe(200)
    })
  })

  describe('exponential backoff', () => {
    it('uses exponential backoff: 1s, 2s, 4s for retries', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
      const promise = fetchWithRetry(fetchFn, 3, 1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchFn).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(2000)
      expect(fetchFn).toHaveBeenCalledTimes(3)
      await vi.advanceTimersByTimeAsync(4000)
      expect(fetchFn).toHaveBeenCalledTimes(4)
      const result = await promise
      expect(result.status).toBe(200)
    })

    it('respects custom initialDelayMs', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
      const promise = fetchWithRetry(fetchFn, 3, 500)
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise
      expect(fetchFn).toHaveBeenCalledTimes(2)
      expect(result.status).toBe(200)
    })
  })

  describe('network errors (status 0)', () => {
    it('retries on network errors (status 0)', async () => {
      const networkErrorResponse = Object.create(Response.prototype)
      Object.defineProperty(networkErrorResponse, 'status', { value: 0, writable: false })
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(networkErrorResponse)
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
      const promise = fetchWithRetry(fetchFn, 3, 1000)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise
      expect(fetchFn).toHaveBeenCalledTimes(2)
      expect(result.status).toBe(200)
    })
  })

  describe('throws after max retries', () => {
    it('throws after exhausting max retries on 5xx errors', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
      const promise = fetchWithRetry(fetchFn, 2, 1000)
      await vi.advanceTimersByTimeAsync(3000)
      await expect(promise).rejects.toThrow('Fetch failed after')
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    it('throws after exhausting max retries on network errors', async () => {
      const networkErrorResponse = Object.create(Response.prototype)
      Object.defineProperty(networkErrorResponse, 'status', { value: 0, writable: false })
      const fetchFn = vi.fn().mockResolvedValue(networkErrorResponse)
      const promise = fetchWithRetry(fetchFn, 1, 1000)
      await vi.advanceTimersByTimeAsync(1000)
      await expect(promise).rejects.toThrow('Fetch failed after')
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('throws the last error when fetchFn throws', async () => {
      const error = new Error('Network failure')
      const fetchFn = vi.fn().mockRejectedValue(error)
      const promise = fetchWithRetry(fetchFn, 2, 1000)
      await vi.advanceTimersByTimeAsync(3000)
      try {
        await promise
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBe(error)
      }
      expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    it('throws generic error when lastError is null', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
      const promise = fetchWithRetry(fetchFn, 0, 1000)
      await expect(promise).rejects.toThrow('Fetch failed after')
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('success cases', () => {
    it.each([200, 201, 301])('returns response on %d status', async (status) => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status }))
      const result = await fetchWithRetry(fetchFn, 3, 1000)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(result.status).toBe(status)
    })
  })
})

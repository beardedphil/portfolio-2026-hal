/**
 * HAL API client helper functions.
 * Extracted from projectManager.ts to improve testability and maintainability.
 */

import { parseHalResponse } from './ticketValidation.js'

export interface HalFetchOptions {
  timeoutMs?: number
  progressMessage?: string
  abortSignal?: AbortSignal
  onProgress?: (message: string) => void | Promise<void>
}

export interface HalFetchResult {
  ok: boolean
  json: any
}

/**
 * Fetches JSON from HAL API with timeout and abort signal support.
 * @param halBaseUrl - Base URL for HAL API
 * @param path - API path (e.g., '/api/tickets/get')
 * @param body - Request body (will be JSON stringified)
 * @param opts - Options including timeout, progress callback, and abort signal
 * @returns Promise resolving to response with ok status and parsed JSON
 */
export async function halFetchJson(
  halBaseUrl: string,
  path: string,
  body: unknown,
  opts?: HalFetchOptions
): Promise<HalFetchResult> {
  const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
  const onAbort = () => controller.abort(opts?.abortSignal?.reason ?? new Error('Aborted'))
  
  try {
    const progress = String(opts?.progressMessage ?? '').trim()
    if (progress) await opts?.onProgress?.(progress)
    if (opts?.abortSignal) {
      opts.abortSignal.addEventListener('abort', onAbort, { once: true })
    }
    
    const res = await fetch(`${halBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })
    
    const text = await res.text()
    const contentType = res.headers.get('content-type')
    const json = parseHalResponse(text, path, res.status, contentType)
    
    return { ok: res.ok, json }
  } finally {
    clearTimeout(t)
    try {
      if (opts?.abortSignal) {
        opts.abortSignal.removeEventListener('abort', onAbort)
      }
    } catch {
      // ignore
    }
  }
}

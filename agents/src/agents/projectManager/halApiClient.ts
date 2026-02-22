/**
 * HAL API client utilities for making HTTP requests with timeout and abort signal support.
 */

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
 * Fetches JSON from HAL API endpoint with timeout and abort signal support.
 * 
 * @param baseUrl - Base URL for HAL API
 * @param path - API path (e.g., '/api/tickets/get')
 * @param body - Request body to send
 * @param options - Options including timeout, progress callback, and abort signal
 * @returns Promise resolving to { ok: boolean, json: any }
 */
export async function halFetchJson(
  baseUrl: string,
  path: string,
  body: unknown,
  options?: HalFetchOptions
): Promise<HalFetchResult> {
  const timeoutMs = Math.max(1_000, Math.floor(options?.timeoutMs ?? 20_000))
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
  const onAbort = () => controller.abort(options?.abortSignal?.reason ?? new Error('Aborted'))
  
  try {
    const progress = String(options?.progressMessage ?? '').trim()
    if (progress) await options?.onProgress?.(progress)
    
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', onAbort, { once: true })
    }
    
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })
    
    const text = await res.text()
    let json: any = {}
    
    if (text) {
      try {
        json = JSON.parse(text)
      } catch (e) {
        const contentType = res.headers.get('content-type') || 'unknown'
        const prefix = text.slice(0, 200)
        json = {
          success: false,
          error: `Non-JSON response from ${path} (HTTP ${res.status}, content-type: ${contentType}): ${prefix}`,
        }
      }
    }
    
    return { ok: res.ok, json }
  } finally {
    clearTimeout(t)
    try {
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort)
      }
    } catch {
      // ignore
    }
  }
}

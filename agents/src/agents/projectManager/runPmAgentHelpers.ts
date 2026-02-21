/**
 * Helper functions extracted from runPmAgent to improve maintainability.
 */

/**
 * Determines if an error is an abort error (from AbortSignal or AbortError).
 */
export function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' && String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Options for halFetchJson requests.
 */
export interface HalFetchOptions {
  timeoutMs?: number
  progressMessage?: string
}

/**
 * Result from halFetchJson.
 */
export interface HalFetchResult {
  ok: boolean
  json: any
}

/**
 * Makes a POST request to a HAL API endpoint with timeout and abort signal support.
 */
export async function halFetchJson(
  halBaseUrl: string,
  path: string,
  body: unknown,
  opts: HalFetchOptions & { abortSignal?: AbortSignal; onProgress?: (message: string) => void | Promise<void> }
): Promise<HalFetchResult> {
  const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
  const onAbort = () => controller.abort(opts.abortSignal?.reason ?? new Error('Aborted'))
  try {
    const progress = String(opts?.progressMessage ?? '').trim()
    if (progress) await opts.onProgress?.(progress)
    if (opts.abortSignal) opts.abortSignal.addEventListener('abort', onAbort, { once: true })
    const res = await fetch(`${halBaseUrl}${path}`, {
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
      if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onAbort)
    } catch {
      // ignore
    }
  }
}

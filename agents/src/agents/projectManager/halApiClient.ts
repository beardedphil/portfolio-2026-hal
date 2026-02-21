/**
 * HAL API client utilities extracted from projectManager.ts to improve maintainability.
 */

export type HalFetchJson = (
  path: string,
  body: unknown,
  opts?: { timeoutMs?: number; progressMessage?: string }
) => Promise<{ ok: boolean; json: any }>

type HalFetchJsonConfig = {
  abortSignal?: AbortSignal
  onProgress?: (message: string) => void | Promise<void>
}

export function createHalFetchJson(
  config: HalFetchJsonConfig,
  halBaseUrl: string
): HalFetchJson {
  return async (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number; progressMessage?: string }
  ) => {
    const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
    const onAbort = () => controller.abort(config.abortSignal?.reason ?? new Error('Aborted'))
    try {
      const progress = String(opts?.progressMessage ?? '').trim()
      if (progress) await config.onProgress?.(progress)
      if (config.abortSignal) config.abortSignal.addEventListener('abort', onAbort, { once: true })
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
        if (config.abortSignal) config.abortSignal.removeEventListener('abort', onAbort)
      } catch {
        // ignore
      }
    }
  }
}

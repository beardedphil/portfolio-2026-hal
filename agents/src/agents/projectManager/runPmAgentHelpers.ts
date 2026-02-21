/**
 * Helper functions for runPmAgent to improve maintainability and testability.
 */

/**
 * Check if an error is an abort error.
 */
export function isAbortError(
  err: unknown,
  abortSignal?: AbortSignal
): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' &&
      String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Fetch JSON from HAL API with timeout and abort signal support.
 */
export async function halFetchJson(
  halBaseUrl: string,
  path: string,
  body: unknown,
  opts?: {
    timeoutMs?: number
    progressMessage?: string
    onProgress?: (message: string) => void | Promise<void>
    abortSignal?: AbortSignal
  }
): Promise<{ ok: boolean; json: any }> {
  const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
  const controller = new AbortController()
  const t = setTimeout(
    () => controller.abort(new Error('HAL request timeout')),
    timeoutMs
  )
  const onAbort = () =>
    controller.abort(opts?.abortSignal?.reason ?? new Error('Aborted'))
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
      if (opts?.abortSignal) {
        opts.abortSignal.removeEventListener('abort', onAbort)
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Build full prompt text including system instructions, context pack, user message, and images.
 */
export function buildFullPromptText(
  systemInstructions: string,
  contextPack: string,
  _userMessage: string,
  images?: Array<{ filename?: string; mimeType?: string }>,
  openaiModel?: string
): string {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const hasImages = images && images.length > 0
  const isVisionModel =
    openaiModel?.includes('vision') || openaiModel?.includes('gpt-4o')
  let imageInfo = ''
  if (hasImages) {
    const imageList = images!
      .map(
        (img, idx) =>
          `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`
      )
      .join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${openaiModel}) does not support vision. Images are ignored.)`
    }
  }
  return `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`
}

/**
 * Build prompt for OpenAI API (string or array format for vision models).
 */
export function buildPromptForOpenAI(
  contextPack: string,
  images?: Array<{ dataUrl: string }>,
  openaiModel?: string
): string | Array<{ type: 'text' | 'image'; text?: string; image?: string }> {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const hasImages = images && images.length > 0
  const isVisionModel =
    openaiModel?.includes('vision') || openaiModel?.includes('gpt-4o')

  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    return [
      { type: 'text' as const, text: promptBase },
      ...images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    // Non-vision model or no images: use string format
    if (hasImages && !isVisionModel) {
      // Log warning but don't fail - user can still send text
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[PM Agent] Images provided but model does not support vision. Images will be ignored.'
        )
      }
    }
    return promptBase
  }
}

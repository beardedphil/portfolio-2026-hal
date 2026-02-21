/**
 * Helper functions for Project Manager agent.
 * Extracted from projectManager.ts to improve maintainability.
 */

/**
 * Checks if an error is an abort error.
 */
export function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' && String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Creates a HAL API fetch function with timeout and abort signal support.
 */
export function createHalFetchJson(
  halBaseUrl: string,
  config: {
    abortSignal?: AbortSignal
    onProgress?: (message: string) => void | Promise<void>
  }
) {
  return async (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number; progressMessage?: string }
  ): Promise<{ ok: boolean; json: any }> => {
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

/**
 * Builds prompt text with image information for display.
 */
export function buildPromptText(
  contextPack: string,
  config: {
    images?: Array<{ filename?: string; mimeType?: string; dataUrl: string }>
    openaiModel: string
  },
  systemInstructions: string
): string {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  let imageInfo = ''
  if (hasImages) {
    const imageList = config.images!.map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`).join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${config.openaiModel}) does not support vision. Images are ignored.)`
    }
  }
  return `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`
}

/**
 * Builds prompt for AI SDK (string or array format for vision models).
 */
export function buildPrompt(
  contextPack: string,
  config: {
    images?: Array<{ dataUrl: string }>
    openaiModel: string
  }
): string | Array<{ type: 'text' | 'image'; text?: string; image?: string }> {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  
  if (hasImages && isVisionModel) {
    return [
      { type: 'text' as const, text: promptBase },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    if (hasImages && !isVisionModel) {
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
    return promptBase
  }
}

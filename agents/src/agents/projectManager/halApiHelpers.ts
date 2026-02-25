/**
 * Helper functions for HAL API interactions in PM agent tools.
 * Extracted from projectManager.ts to reduce complexity and improve maintainability.
 */

export interface HalFetchOptions {
  timeoutMs?: number
  progressMessage?: string
}

export interface HalFetchResult {
  ok: boolean
  json: any
}

/**
 * Fetch JSON from HAL API with timeout and abort signal support.
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

/**
 * Create RED artifact body markdown from RED document data.
 */
export function createRedArtifactBody(
  redId: string,
  version: number,
  createdAt: string,
  validationStatus: string,
  redJson: unknown,
  retrievalMetadata?: {
    repoFilter?: string
    pinnedIncluded: boolean
    recencyWindow?: string
    totalConsidered: number
    totalSelected: number
  }
): string {
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num)
  }

  let retrievalSection = ''
  if (retrievalMetadata) {
    retrievalSection = `
## Retrieval sources

${retrievalMetadata.repoFilter ? `- **Repo filter:** ${retrievalMetadata.repoFilter}` : ''}
- **Pinned included:** ${retrievalMetadata.pinnedIncluded ? 'Yes' : 'No'}
${retrievalMetadata.recencyWindow ? `- **Recency window:** ${retrievalMetadata.recencyWindow}` : ''}
- **Items considered:** ${formatNumber(retrievalMetadata.totalConsidered)}
- **Items selected:** ${formatNumber(retrievalMetadata.totalSelected)}
${retrievalMetadata.totalConsidered === 0 ? '\n> **No matching sources found**' : ''}

`
  }

  return `# RED Document Version ${version}

RED ID: ${redId}
Created: ${createdAt}
Validation Status: ${validationStatus}
${retrievalSection}## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJson, null, 2)}
\`\`\`
`
}

/**
 * Get RED artifact title from version and creation date.
 */
export function getRedArtifactTitle(version: number, createdAt: string): string {
  return `RED v${version} — ${createdAt.split('T')[0]}`
}

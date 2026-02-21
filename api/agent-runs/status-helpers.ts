/**
 * Helper functions for agent run status processing.
 * Extracted from status.ts to improve maintainability and testability.
 */

export const MAX_RUN_SUMMARY_CHARS = 20_000

/**
 * Caps text to a maximum character length, appending [truncated] if needed.
 */
export function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

/**
 * Checks if a summary is a placeholder value (e.g., "Completed.", "Done.").
 */
export function isPlaceholderSummary(summary: string | null | undefined): boolean {
  const s = String(summary ?? '').trim()
  if (!s) return true
  return s === 'Completed.' || s === 'Done.' || s === 'Complete.' || s === 'Finished.'
}

/**
 * Extracts the last assistant message from a conversation JSON string.
 * Handles multiple conversation formats and content structures.
 */
export function getLastAssistantMessage(conversationText: string): string | null {
  try {
    const conv = JSON.parse(conversationText) as any
    const messages: any[] =
      (Array.isArray(conv?.messages) && conv.messages) ||
      (Array.isArray(conv?.conversation?.messages) && conv.conversation.messages) ||
      []

    const toText = (content: unknown): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((p) => {
            if (typeof p === 'string') return p
            if (p && typeof p === 'object') {
              const anyP = p as any
              return (
                (typeof anyP.text === 'string' ? anyP.text : '') ||
                (typeof anyP.content === 'string' ? anyP.content : '') ||
                (typeof anyP.value === 'string' ? anyP.value : '')
              )
            }
            return ''
          })
          .filter(Boolean)
          .join('')
      }
      if (content && typeof content === 'object') {
        const anyC = content as any
        if (typeof anyC.text === 'string') return anyC.text
        if (typeof anyC.content === 'string') return anyC.content
        if (typeof anyC.value === 'string') return anyC.value
      }
      return ''
    }

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m?.role === 'assistant' && String(toText(m?.content ?? '')).trim())
    const content = toText(lastAssistant?.content ?? '').trim()
    return content ? content : null
  } catch {
    return null
  }
}

/**
 * Parses process review suggestions from text.
 * Supports multiple formats: direct JSON array, markdown code blocks, or embedded JSON.
 */
export function parseProcessReviewSuggestionsFromText(
  input: string
): Array<{ text: string; justification: string }> | null {
  const text = String(input ?? '').trim()
  if (!text) return null

  const tryParse = (candidate: string): Array<{ text: string; justification: string }> | null => {
    const s = candidate.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (!Array.isArray(parsed)) return null
      const suggestions = (parsed as any[])
        .filter((item) => item && typeof item === 'object')
        .filter((item) => typeof (item as any).text === 'string' && typeof (item as any).justification === 'string')
        .map((item) => ({
          text: String((item as any).text).trim(),
          justification: String((item as any).justification).trim(),
        }))
        .filter((s) => s.text.length > 0 && s.justification.length > 0)
      return suggestions
    } catch {
      return null
    }
  }

  // 1) If the whole message is already a JSON array, parse directly.
  const direct = tryParse(text)
  if (direct) return direct

  // 2) If wrapped in markdown code blocks, prefer the first fenced block body.
  // Supports ```json ... ``` and ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    const fromFence = tryParse(fenced[1])
    if (fromFence) return fromFence
  }

  // 3) Fallback: extract the first JSON-ish array substring via a simple bracket match.
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (depth === 0) {
      const slice = text.slice(start, i + 1)
      const fromSlice = tryParse(slice)
      if (fromSlice) return fromSlice
      break
    }
  }
  return null
}

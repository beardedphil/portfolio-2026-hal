/** Human-readable error summary for Cursor API failures (no stack traces). */
export function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 100)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

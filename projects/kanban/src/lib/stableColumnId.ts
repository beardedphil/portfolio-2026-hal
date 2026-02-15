/**
 * Generates a stable column ID.
 * 
 * Uses crypto.randomUUID() if available (modern browsers),
 * otherwise falls back to a timestamp-based ID.
 */
export function stableColumnId(): string {
  return typeof crypto !== 'undefined' && crypto !== null && crypto.randomUUID
    ? crypto.randomUUID()
    : `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

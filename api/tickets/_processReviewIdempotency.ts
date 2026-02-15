/**
 * Process Review ticket-creation idempotency utilities.
 * Provides functions for computing suggestion hashes and building duplicate detection patterns.
 */

import crypto from 'node:crypto'

/**
 * Computes a 16-character hash from normalized suggestion text.
 * The suggestion is trimmed before hashing to ensure consistent results.
 * 
 * @param suggestion - The suggestion text (will be trimmed before hashing)
 * @returns A 16-character hexadecimal hash string
 */
export function computeSuggestionHash(suggestion: string): string {
  const normalizedSuggestion = suggestion.trim()
  return crypto.createHash('sha256').update(normalizedSuggestion).digest('hex').slice(0, 16)
}

/**
 * Builds a pattern string for matching suggestion hash in ticket body_md.
 * This pattern is used in Supabase `.like()` queries to detect duplicate tickets.
 * 
 * @param hash - The 16-character suggestion hash
 * @returns Pattern string: "Suggestion Hash**: <hash>"
 */
export function buildHashPattern(hash: string): string {
  return `Suggestion Hash**: ${hash}`
}

/**
 * Builds a pattern string for matching source reference in ticket body_md.
 * This pattern is used in Supabase `.like()` queries to detect duplicate tickets.
 * 
 * @param sourceRef - The source ticket reference (e.g., "HAL-0123")
 * @returns Pattern string: "Proposed from**: <sourceRef> — Process Review"
 */
export function buildSourcePattern(sourceRef: string): string {
  return `Proposed from**: ${sourceRef} — Process Review`
}

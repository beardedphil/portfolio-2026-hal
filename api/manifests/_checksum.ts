/**
 * Deterministic checksum generation for Integration Manifests.
 * Uses canonical JSON serialization to ensure the same logical JSON produces the same checksum.
 */

import { createHash } from 'crypto'

/**
 * Generates a deterministic checksum for a JSON object.
 * Uses canonical JSON serialization (sorted keys, no whitespace) to ensure
 * the same logical JSON always produces the same checksum.
 * 
 * @param json - The JSON object to checksum
 * @returns A hex-encoded SHA-256 checksum string
 */
export function generateManifestChecksum(json: unknown): string {
  // Convert to canonical JSON string:
  // 1. Sort object keys recursively
  // 2. Remove all whitespace
  // 3. Use consistent formatting
  const canonical = canonicalizeJson(json)
  
  // Hash the canonical string
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Recursively canonicalizes a JSON value to ensure deterministic serialization.
 * - Objects: keys are sorted alphabetically
 * - Arrays: order is preserved (but elements are canonicalized)
 * - Primitives: normalized (null, boolean, number, string)
 */
function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  
  if (typeof value === 'number') {
    // Handle special cases: NaN, Infinity, -Infinity
    if (Number.isNaN(value)) return 'null'
    if (!Number.isFinite(value)) {
      return 'null' // Represent non-finite as null for consistency
    }
    return String(value)
  }
  
  if (typeof value === 'string') {
    // Escape and quote the string
    return JSON.stringify(value)
  }
  
  if (Array.isArray(value)) {
    const items = value.map(item => canonicalizeJson(item))
    return `[${items.join(',')}]`
  }
  
  if (typeof value === 'object') {
    // Sort keys alphabetically
    const keys = Object.keys(value).sort()
    const pairs = keys.map(key => {
      const val = (value as Record<string, unknown>)[key]
      return `${JSON.stringify(key)}:${canonicalizeJson(val)}`
    })
    return `{${pairs.join(',')}}`
  }
  
  // Fallback: use JSON.stringify for unknown types
  return JSON.stringify(value)
}

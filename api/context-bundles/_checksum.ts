/**
 * Deterministic checksum generation for Context Bundles.
 * Uses canonical JSON serialization to ensure the same logical JSON produces the same checksum.
 */

import { createHash } from 'crypto'

/**
 * Generates a deterministic checksum for a JSON object (content checksum).
 * Uses canonical JSON serialization (sorted keys, no whitespace) to ensure
 * the same logical JSON always produces the same checksum.
 * 
 * @param json - The JSON object to checksum
 * @returns A hex-encoded SHA-256 checksum string
 */
export function generateContentChecksum(json: unknown): string {
  // Convert to canonical JSON string:
  // 1. Sort object keys recursively
  // 2. Remove all whitespace
  // 3. Use consistent formatting
  const canonical = canonicalizeJson(json)
  
  // Hash the canonical string
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Generates a bundle checksum that includes metadata (repo, ticket, role, version).
 * This ensures the entire bundle (content + metadata) has a unique checksum.
 * 
 * @param bundleJson - The bundle JSON content
 * @param metadata - Bundle metadata (repo, ticket, role, version)
 * @returns A hex-encoded SHA-256 checksum string
 */
export function generateBundleChecksum(
  bundleJson: unknown,
  metadata: {
    repoFullName: string
    ticketPk: string
    ticketId: string
    role: string
    version: number
  }
): string {
  // Create a canonical representation of bundle + metadata
  const canonical = canonicalizeJson({
    bundle: bundleJson,
    metadata: {
      repo_full_name: metadata.repoFullName,
      ticket_pk: metadata.ticketPk,
      ticket_id: metadata.ticketId,
      role: metadata.role,
      version: metadata.version,
    },
  })
  
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Recursively canonicalizes a JSON value to ensure deterministic serialization.
 * - Objects: keys are sorted alphabetically
 * - Arrays: order is preserved
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
      return value > 0 ? 'null' : 'null' // Represent non-finite as null for consistency
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

/**
 * Calculates per-section character counts from a context bundle.
 * 
 * @param bundleJson - The bundle JSON object
 * @returns Object mapping section names to character counts
 */
export function calculateSectionMetrics(bundleJson: unknown): Record<string, number> {
  const metrics: Record<string, number> = {}
  
  if (typeof bundleJson === 'object' && bundleJson !== null) {
    const bundle = bundleJson as Record<string, unknown>
    
    // Common sections in context bundles
    const sectionKeys = [
      'ticket',
      'repo_context',
      'instructions',
      'conversation',
      'state_snapshot',
      'manifest',
      'red',
      'git_status',
    ]
    
    for (const key of sectionKeys) {
      if (key in bundle) {
        const section = bundle[key]
        if (typeof section === 'string') {
          metrics[key] = section.length
        } else if (section !== null && section !== undefined) {
          // Convert to JSON string and count characters
          metrics[key] = JSON.stringify(section).length
        }
      }
    }
    
    // Also count any other top-level keys
    for (const key of Object.keys(bundle)) {
      if (!sectionKeys.includes(key) && !metrics[key]) {
        const value = bundle[key]
        if (typeof value === 'string') {
          metrics[key] = value.length
        } else if (value !== null && value !== undefined) {
          metrics[key] = JSON.stringify(value).length
        }
      }
    }
  }
  
  return metrics
}

/**
 * Calculates total character count from section metrics.
 * 
 * @param sectionMetrics - Per-section character counts
 * @returns Total character count
 */
export function calculateTotalCharacters(sectionMetrics: Record<string, number>): number {
  return Object.values(sectionMetrics).reduce((sum, count) => sum + count, 0)
}

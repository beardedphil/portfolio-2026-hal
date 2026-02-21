/**
 * Integration Manifest Context Integration
 * 
 * Utilities for including Integration Manifests in Context Bundles and Receipts.
 * 
 * Context Bundles (T7) should include the latest manifest for the repo to provide
 * agents with project context (goal, stack, constraints, conventions).
 * 
 * Receipts (T10) should reference the manifest version used during the agent run
 * to enable reconstruction and drift detection.
 */

import { createClient } from '@supabase/supabase-js'
import type { IntegrationManifestV0, IntegrationManifestRecord } from './types.js'

/**
 * Gets the latest Integration Manifest for a repository.
 * 
 * This function is intended for use in:
 * - Context Bundle generation (T7) - include manifest in bundle
 * - Receipt storage (T10) - reference manifest version in receipt
 * 
 * @param repoFullName - Repository full name (owner/repo)
 * @param schemaVersion - Schema version (default: 'v0')
 * @returns Latest manifest record or null if not found
 */
export async function getLatestManifest(
  repoFullName: string,
  schemaVersion: string = 'v0'
): Promise<IntegrationManifestRecord | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('integration_manifests')
    .select('*')
    .eq('repo_full_name', repoFullName)
    .eq('schema_version', schemaVersion)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data as IntegrationManifestRecord
}

/**
 * Gets a specific manifest version by version number.
 * 
 * @param repoFullName - Repository full name (owner/repo)
 * @param version - Version number
 * @param schemaVersion - Schema version (default: 'v0')
 * @returns Manifest record or null if not found
 */
export async function getManifestByVersion(
  repoFullName: string,
  version: number,
  schemaVersion: string = 'v0'
): Promise<IntegrationManifestRecord | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('integration_manifests')
    .select('*')
    .eq('repo_full_name', repoFullName)
    .eq('schema_version', schemaVersion)
    .eq('version', version)
    .single()

  if (error || !data) {
    return null
  }

  return data as IntegrationManifestRecord
}

/**
 * Example structure for including manifest in Context Bundle (T7):
 * 
 * ```typescript
 * interface ContextBundle {
 *   manifest: IntegrationManifestV0  // Latest manifest for the repo
 *   ticket: Ticket
 *   state_snapshot: StateSnapshot
 *   // ... other bundle contents
 * }
 * ```
 * 
 * Usage:
 * ```typescript
 * const manifest = await getLatestManifest(repoFullName)
 * const bundle: ContextBundle = {
 *   manifest: manifest?.manifest_json || null,
 *   // ... other bundle contents
 * }
 * ```
 */

/**
 * Example structure for referencing manifest in Receipt (T10):
 * 
 * ```typescript
 * interface ContextReceipt {
 *   checksum: string
 *   manifest_version: number  // Version of manifest used
 *   manifest_id: string        // ID of manifest record
 *   artifact_versions: string[]
 *   snippet_references: SnippetReference[]
 * }
 * ```
 * 
 * Usage:
 * ```typescript
 * const manifest = await getLatestManifest(repoFullName)
 * const receipt: ContextReceipt = {
 *   checksum: bundleChecksum,
 *   manifest_version: manifest?.version || null,
 *   manifest_id: manifest?.manifest_id || null,
 *   // ... other receipt contents
 * }
 * ```
 */

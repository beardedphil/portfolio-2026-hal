/**
 * Integration Manifest integration with Context Bundles
 * 
 * This module provides helpers for including manifests in context bundles.
 * Context bundles are planned for Phase 3 (T7) of the HAL upgrade roadmap.
 * 
 * When build_context_bundle is implemented, it should use getManifestForContext
 * to include the manifest in the bundle.
 */

import type { IntegrationManifest } from './generate.js'

/**
 * Gets the latest manifest for a repository to include in a context bundle.
 * 
 * This function will be called by build_context_bundle(project_id, ticket_id, role)
 * to include the manifest in the context bundle.
 * 
 * @param repoFullName - Repository full name (e.g., "owner/repo")
 * @param supabaseUrl - Supabase URL
 * @param supabaseKey - Supabase service role key
 * @returns The latest manifest for the repository, or null if not found
 */
export async function getManifestForContext(
  repoFullName: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<IntegrationManifest | null> {
  // This will be implemented when context bundles are built
  // For now, return null to indicate manifest should be fetched via API
  // The actual implementation will query the integration_manifests table
  return null
}

/**
 * Manifest reference format for context bundles.
 * 
 * When a context bundle is built, it should include a manifest reference:
 * {
 *   manifest_version_id: string,
 *   manifest_version_number: number,
 *   manifest: IntegrationManifest
 * }
 */
export interface ManifestReference {
  manifest_version_id: string
  manifest_version_number: number
  manifest: IntegrationManifest
}

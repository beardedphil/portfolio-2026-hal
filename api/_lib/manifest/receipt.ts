/**
 * Integration Manifest integration with Context Receipts
 * 
 * This module provides helpers for storing manifest references in context receipts.
 * Context receipts are planned for Phase 3 (T10) of the HAL upgrade roadmap.
 * 
 * When context receipts are stored, they should include a reference to the manifest
 * version that was used when building the context bundle.
 */

import type { IntegrationManifest } from './generate.js'

/**
 * Manifest reference format for context receipts.
 * 
 * When a context receipt is stored, it should include:
 * {
 *   manifest_version_id: string,
 *   manifest_content_hash: string,
 *   manifest_schema_version: string
 * }
 * 
 * This allows reconstructing the exact manifest that was used for a given agent run.
 */
export interface ManifestReceiptReference {
  manifest_version_id: string
  manifest_content_hash: string
  manifest_schema_version: string
  repo_full_name: string
  default_branch: string
}

/**
 * Creates a manifest receipt reference from a manifest version ID.
 * 
 * This function will be called when storing context receipts to record
 * which manifest version was used for the agent run.
 * 
 * @param versionId - Manifest version ID
 * @param manifest - The manifest content
 * @returns A receipt reference that can be stored with the context receipt
 */
export function createManifestReceiptReference(
  versionId: string,
  manifest: IntegrationManifest
): ManifestReceiptReference {
  return {
    manifest_version_id: versionId,
    manifest_content_hash: '', // Will be computed from manifest
    manifest_schema_version: manifest.schema_version,
    repo_full_name: manifest.repo_full_name,
    default_branch: manifest.default_branch,
  }
}

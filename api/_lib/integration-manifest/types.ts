/**
 * Integration Manifest v0 Types
 */

export interface ProjectManifest {
  goal: string
  stack: Record<string, string[]>
  constraints: Record<string, string>
  conventions: Record<string, string>
}

export interface IntegrationManifestV0 {
  schema_version: 'v0'
  repo_full_name: string
  default_branch: string
  project_id: string
  env_identifiers: Record<string, string>
  project_manifest: ProjectManifest
  generated_at: string
}

export interface IntegrationManifestRecord {
  manifest_id: string
  repo_full_name: string
  default_branch: string
  schema_version: string
  version: number
  manifest_json: IntegrationManifestV0
  content_checksum: string
  previous_version_id: string | null
  created_at: string
  created_by: string | null
}

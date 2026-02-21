/**
 * Helper functions for manifest integration with Context Bundles and Receipts.
 */

import { createClient } from '@supabase/supabase-js'

export type ManifestReference = {
  manifest_id: string
  repo_full_name: string
  schema_version: string
  content_hash: string
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
}

/**
 * Get the latest manifest for a repo.
 * Returns null if no manifest exists.
 */
export async function getLatestManifestForRepo(
  supabaseUrl: string,
  supabaseKey: string,
  repoFullName: string
): Promise<ManifestReference | null> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: manifests, error } = await supabase
    .from('integration_manifests')
    .select('manifest_id, repo_full_name, schema_version, content_hash, goal, stack, constraints, conventions')
    .eq('repo_full_name', repoFullName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !manifests) {
    return null
  }

  return {
    manifest_id: manifests.manifest_id,
    repo_full_name: manifests.repo_full_name,
    schema_version: manifests.schema_version,
    content_hash: manifests.content_hash,
    goal: manifests.goal,
    stack: manifests.stack as string[],
    constraints: manifests.constraints as string[],
    conventions: manifests.conventions as string[],
  }
}

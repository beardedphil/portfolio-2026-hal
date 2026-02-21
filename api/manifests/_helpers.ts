/**
 * Helper functions for manifest integration with other systems.
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Fetches the latest manifest for a repository and branch.
 * Returns null if no manifest exists.
 */
export async function getLatestManifest(
  supabase: ReturnType<typeof createClient>,
  repoFullName: string,
  defaultBranch: string
): Promise<{ manifest_id: string; content_checksum: string } | null> {
  const { data, error } = await supabase
    .from('integration_manifests')
    .select('manifest_id, content_checksum')
    .eq('repo_full_name', repoFullName)
    .eq('default_branch', defaultBranch)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    manifest_id: data.manifest_id,
    content_checksum: data.content_checksum,
  }
}

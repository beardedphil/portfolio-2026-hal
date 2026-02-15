/**
 * Shared artifact cleanup utilities (duplicate removal, empty artifact deletion).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubstantiveContent, hasSubstantiveQAContent } from './_validation.js'

export interface ArtifactForCleanup {
  artifact_id: string
  body_md?: string
  created_at: string
}

/**
 * Separates artifacts into those with content and empty/placeholder ones.
 */
export function separateArtifactsByContent(
  artifacts: ArtifactForCleanup[],
  canonicalTitle: string,
  isQA: boolean
): {
  artifactsWithContent: Array<{ artifact_id: string; created_at: string }>
  emptyArtifactIds: string[]
} {
  const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
  const emptyArtifactIds: string[] = []

  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const validation = isQA
      ? hasSubstantiveQAContent(currentBody, canonicalTitle)
      : hasSubstantiveContent(currentBody, canonicalTitle)

    if (validation.valid) {
      artifactsWithContent.push({
        artifact_id: artifact.artifact_id,
        created_at: artifact.created_at,
      })
    } else {
      emptyArtifactIds.push(artifact.artifact_id)
    }
  }

  return { artifactsWithContent, emptyArtifactIds }
}

/**
 * Deletes empty/placeholder artifacts.
 */
export async function deleteEmptyArtifacts(
  supabase: SupabaseClient,
  emptyArtifactIds: string[]
): Promise<void> {
  if (emptyArtifactIds.length === 0) return

  const { error: deleteError } = await supabase
    .from('agent_artifacts')
    .delete()
    .in('artifact_id', emptyArtifactIds)

  if (deleteError) {
    console.warn(`Failed to delete empty artifacts: ${deleteError.message}`)
  }
}

/**
 * Deletes duplicate artifacts (keeping the target one).
 */
export async function deleteDuplicateArtifacts(
  supabase: SupabaseClient,
  duplicateIds: string[]
): Promise<void> {
  if (duplicateIds.length === 0) return

  const { error: deleteDuplicateError } = await supabase
    .from('agent_artifacts')
    .delete()
    .in('artifact_id', duplicateIds)

  if (deleteDuplicateError) {
    console.warn(`Failed to delete duplicate artifacts: ${deleteDuplicateError.message}`)
  }
}

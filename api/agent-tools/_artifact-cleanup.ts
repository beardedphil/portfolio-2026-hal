import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubstantiveContent, hasSubstantiveQAContent } from '../artifacts/_validation.js'

export interface Artifact {
  artifact_id: string
  body_md?: string
  created_at: string
}

export interface CleanupResult {
  artifactsWithContent: Array<{ artifact_id: string; created_at: string }>
  emptyArtifactIds: string[]
}

/**
 * Separates artifacts into those with content and empty/placeholder ones.
 * Returns both lists for cleanup decision logic.
 */
export function separateArtifactsByContent(
  artifacts: Artifact[],
  canonicalTitle: string,
  useQaValidation: boolean = false
): CleanupResult {
  const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
  const emptyArtifactIds: string[] = []

  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const currentValidation = useQaValidation
      ? hasSubstantiveQAContent(currentBody, canonicalTitle)
      : hasSubstantiveContent(currentBody, canonicalTitle)
    
    if (currentValidation.valid) {
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
 * Deletes empty/placeholder artifacts from Supabase.
 * Returns true if deletion was successful (or no artifacts to delete), false on error.
 */
export async function deleteEmptyArtifacts(
  supabase: SupabaseClient,
  emptyArtifactIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (emptyArtifactIds.length === 0) {
    return { success: true }
  }

  const { error: deleteError } = await supabase
    .from('agent_artifacts')
    .delete()
    .in('artifact_id', emptyArtifactIds)

  if (deleteError) {
    return { success: false, error: deleteError.message }
  }

  return { success: true }
}

/**
 * Determines which artifact to update based on cleanup logic.
 * Prefers the most recent artifact with content, or most recent overall if none have content.
 */
export function selectTargetArtifact(
  artifacts: Artifact[],
  artifactsWithContent: Array<{ artifact_id: string; created_at: string }>,
  emptyArtifactIds: string[]
): string | null {
  if (artifactsWithContent.length > 0) {
    // Use the most recent artifact that has content
    return artifactsWithContent[0].artifact_id
  }

  if (artifacts.length > 0) {
    // If all were empty and we deleted them, we'll insert a new one
    // But if there's still one left (race condition), use it
    const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    if (remaining.length > 0) {
      return remaining[0].artifact_id
    }
  }

  return null
}

/**
 * Deletes duplicate artifacts (all except the target artifact).
 * Returns list of deleted IDs and any error.
 */
export async function deleteDuplicateArtifacts(
  supabase: SupabaseClient,
  artifacts: Artifact[],
  targetArtifactId: string,
  emptyArtifactIds: string[]
): Promise<{ deletedIds: string[]; error?: string }> {
  const duplicateIds = artifacts
    .map((a) => a.artifact_id)
    .filter((id) => id !== targetArtifactId && !emptyArtifactIds.includes(id))

  if (duplicateIds.length === 0) {
    return { deletedIds: [] }
  }

  const { error: deleteDuplicateError } = await supabase
    .from('agent_artifacts')
    .delete()
    .in('artifact_id', duplicateIds)

  if (deleteDuplicateError) {
    return { deletedIds: duplicateIds, error: deleteDuplicateError.message }
  }

  return { deletedIds: duplicateIds }
}

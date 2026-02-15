/**
 * Individual artifact operations (update, insert, delete).
 * Extracted from _artifact-storage.ts to keep modules under 250 lines.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubstantiveContent, hasSubstantiveQAContent } from './_validation.js'

/**
 * Separates artifacts into those with content and empty/placeholder ones.
 */
export function separateArtifactsByContent(
  artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }>,
  canonicalTitle: string,
  isQAContent: boolean
): {
  artifactsWithContent: Array<{ artifact_id: string; created_at: string }>
  emptyArtifactIds: string[]
} {
  const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
  const emptyArtifactIds: string[] = []

  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const currentValidation = isQAContent
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
 * Deletes empty/placeholder artifacts to clean up duplicates.
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
 * Updates existing artifact by appending new content (preserves history).
 */
export async function updateArtifact(
  supabase: SupabaseClient,
  artifactId: string,
  canonicalTitle: string,
  existingBody: string,
  newBody: string
): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toISOString()
  const separator = '\n\n---\n\n'
  const appendedBody = existingBody.trim()
    ? `${existingBody.trim()}${separator}**Update (${timestamp}):**\n\n${newBody}`
    : newBody

  const { error: updateError } = await supabase
    .from('agent_artifacts')
    .update({
      title: canonicalTitle,
      body_md: appendedBody,
    })
    .eq('artifact_id', artifactId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Verify the update by reading back the artifact
  const { data: updatedArtifact, error: readError } = await supabase
    .from('agent_artifacts')
    .select('body_md')
    .eq('artifact_id', artifactId)
    .single()

  if (readError) {
    console.warn(`Failed to read back updated artifact: ${readError.message}`)
  } else {
    const persistedLength = updatedArtifact?.body_md?.length ?? 0
    console.log(`Artifact updated successfully. Persisted body_md length=${persistedLength}`)
  }

  return { success: true }
}

/**
 * Inserts new artifact with canonical title.
 */
export async function insertArtifact(
  supabase: SupabaseClient,
  ticketPk: string,
  repoFullName: string,
  agentType: 'implementation' | 'qa',
  canonicalTitle: string,
  body_md: string
): Promise<{ success: boolean; artifact_id?: string; error?: string }> {
  const { data: inserted, error: insertError } = await supabase
    .from('agent_artifacts')
    .insert({
      ticket_pk: ticketPk,
      repo_full_name: repoFullName || '',
      agent_type: agentType,
      title: canonicalTitle,
      body_md,
    })
    .select('artifact_id')
    .single()

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  // Verify the insert by reading back the artifact
  const insertedId = inserted.artifact_id
  const { data: insertedArtifact, error: readError } = await supabase
    .from('agent_artifacts')
    .select('body_md')
    .eq('artifact_id', insertedId)
    .single()

  if (readError) {
    console.warn(`Failed to read back inserted artifact: ${readError.message}`)
  } else {
    const persistedLength = insertedArtifact?.body_md?.length ?? 0
    console.log(`Artifact inserted successfully. Persisted body_md length=${persistedLength}`)
  }

  return { success: true, artifact_id: inserted.artifact_id }
}

/**
 * Deletes duplicate artifacts (different title formats for same canonical type).
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

/**
 * Handles race condition when insert fails due to duplicate key.
 * Attempts to find and update existing artifact.
 */
export async function handleRaceCondition(
  supabase: SupabaseClient,
  ticketPk: string,
  agentType: 'implementation' | 'qa',
  artifactType: string,
  canonicalTitle: string,
  body_md: string
): Promise<{ success: boolean; artifact_id?: string }> {
  const { findArtifactsByCanonicalId } = await import('./_shared.js')
  const { artifacts: raceArtifacts, error: raceFindError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    agentType,
    artifactType
  )

  if (raceFindError || !raceArtifacts || raceArtifacts.length === 0) {
    return { success: false }
  }

  const targetArtifact = raceArtifacts[0]
  const { error: updateError } = await supabase
    .from('agent_artifacts')
    .update({
      title: canonicalTitle,
      body_md,
    })
    .eq('artifact_id', targetArtifact.artifact_id)

  if (updateError) {
    return { success: false }
  }

  return { success: true, artifact_id: targetArtifact.artifact_id }
}

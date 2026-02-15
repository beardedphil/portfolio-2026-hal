/**
 * Shared artifact storage logic (insert, update, duplicate cleanup).
 * Extracted from insert-implementation.ts and insert-qa.ts to reduce duplication.
 * Orchestrates artifact operations from _artifact-operations.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { findArtifactsByCanonicalId } from './_shared.js'
import { logStorageAttempt } from './_log-attempt.js'
import {
  separateArtifactsByContent,
  deleteEmptyArtifacts,
  updateArtifact,
  insertArtifact,
  deleteDuplicateArtifacts,
  handleRaceCondition,
} from './_artifact-operations.js'

export interface ArtifactStorageOptions {
  supabase: SupabaseClient
  ticketPk: string
  repoFullName: string
  artifactType: string
  agentType: 'implementation' | 'qa'
  canonicalTitle: string
  body_md: string
  endpointPath: string
  isQAContent?: boolean
}

export interface ArtifactStorageResult {
  success: boolean
  artifact_id?: string
  action?: 'inserted' | 'updated'
  cleaned_up_duplicates?: number
  race_condition_handled?: boolean
  error?: string
}

/**
 * Stores or updates an artifact, handling duplicates and race conditions.
 * This is the main entry point for artifact storage logic.
 */
export async function storeArtifact(
  options: ArtifactStorageOptions
): Promise<ArtifactStorageResult> {
  const {
    supabase,
    ticketPk,
    repoFullName,
    artifactType,
    agentType,
    canonicalTitle,
    body_md,
    endpointPath,
    isQAContent = false,
  } = options

  // Find existing artifacts by canonical identifier
  const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    agentType,
    artifactType
  )

  if (findError) {
    await logStorageAttempt(
      supabase,
      ticketPk,
      repoFullName,
      artifactType,
      agentType,
      endpointPath,
      'request failed',
      findError
    )
    return { success: false, error: findError }
  }

  const artifacts = (existingArtifacts || []) as Array<{
    artifact_id: string
    body_md?: string
    created_at: string
  }>

  // Separate artifacts by content
  const { artifactsWithContent, emptyArtifactIds } = separateArtifactsByContent(
    artifacts,
    canonicalTitle,
    isQAContent
  )

  // Delete empty artifacts
  await deleteEmptyArtifacts(supabase, emptyArtifactIds)

  // Determine target artifact (prefer most recent with content)
  let targetArtifactId: string | null = null
  if (artifactsWithContent.length > 0) {
    targetArtifactId = artifactsWithContent[0].artifact_id
  } else if (artifacts.length > 0) {
    const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    if (remaining.length > 0) {
      targetArtifactId = remaining[0].artifact_id
    }
  }

  if (targetArtifactId) {
    // Delete duplicate artifacts (different title formats)
    const duplicateIds = artifacts
      .map((a) => a.artifact_id)
      .filter((id) => id !== targetArtifactId && !emptyArtifactIds.includes(id))

    await deleteDuplicateArtifacts(supabase, duplicateIds)

    // Update existing artifact
    const existingArtifact = artifacts.find((a) => a.artifact_id === targetArtifactId)
    const existingBody = existingArtifact?.body_md || ''

    const updateResult = await updateArtifact(
      supabase,
      targetArtifactId,
      canonicalTitle,
      existingBody,
      body_md
    )

    if (!updateResult.success) {
      await logStorageAttempt(
        supabase,
        ticketPk,
        repoFullName,
        artifactType,
        agentType,
        endpointPath,
        'request failed',
        updateResult.error || 'Failed to update artifact'
      )
      return { success: false, error: updateResult.error }
    }

    await logStorageAttempt(
      supabase,
      ticketPk,
      repoFullName,
      artifactType,
      agentType,
      endpointPath,
      'stored'
    )

    return {
      success: true,
      artifact_id: targetArtifactId,
      action: 'updated',
      cleaned_up_duplicates: emptyArtifactIds.length + duplicateIds.length,
    }
  }

  // Insert new artifact
  const insertResult = await insertArtifact(
    supabase,
    ticketPk,
    repoFullName,
    agentType,
    canonicalTitle,
    body_md
  )

  if (!insertResult.success) {
    // Handle race condition
    if (insertResult.error?.includes('duplicate') || insertResult.error?.includes('23505')) {
      console.log('Race condition detected: duplicate key error, attempting to find and update existing artifact')
      const raceResult = await handleRaceCondition(
        supabase,
        ticketPk,
        agentType,
        artifactType,
        canonicalTitle,
        body_md
      )

      if (raceResult.success) {
        await logStorageAttempt(
          supabase,
          ticketPk,
          repoFullName,
          artifactType,
          agentType,
          endpointPath,
          'stored'
        )
        return {
          success: true,
          artifact_id: raceResult.artifact_id,
          action: 'updated',
          cleaned_up_duplicates: emptyArtifactIds.length,
          race_condition_handled: true,
        }
      }
    }

    await logStorageAttempt(
      supabase,
      ticketPk,
      repoFullName,
      artifactType,
      agentType,
      endpointPath,
      'request failed',
      insertResult.error || 'Failed to insert artifact'
    )
    return { success: false, error: insertResult.error }
  }

  await logStorageAttempt(
    supabase,
    ticketPk,
    repoFullName,
    artifactType,
    agentType,
    endpointPath,
    'stored'
  )

  return {
    success: true,
    artifact_id: insertResult.artifact_id,
    action: 'inserted',
    cleaned_up_duplicates: emptyArtifactIds.length,
  }
}

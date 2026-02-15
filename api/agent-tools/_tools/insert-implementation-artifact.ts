import type { SupabaseClient } from '@supabase/supabase-js'
import { createCanonicalTitle, findArtifactsByCanonicalId } from '../../artifacts/_shared.js'
import { validateImplementationArtifactContent } from '../_validation.js'
import {
  separateArtifactsByContent,
  deleteEmptyArtifacts,
  selectTargetArtifact,
  deleteDuplicateArtifacts,
  type Artifact,
} from '../_artifact-cleanup.js'

export interface InsertImplementationArtifactParams {
  ticketId: string
  artifactType: string
  title: string
  body_md: string
}

export interface InsertImplementationArtifactResult {
  success: boolean
  artifact_id?: string
  action?: 'inserted' | 'updated'
  cleaned_up_duplicates?: number
  race_condition_handled?: boolean
  error?: string
  validation_failed?: boolean
}

/**
 * Inserts or updates an implementation artifact.
 * Handles duplicate cleanup, validation, and race conditions.
 */
export async function insertImplementationArtifact(
  supabase: SupabaseClient,
  params: InsertImplementationArtifactParams
): Promise<InsertImplementationArtifactResult> {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, display_id')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError || !ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found in Supabase.` }
  }

  const ticketPk = (ticket as { pk?: string }).pk
  if (!ticketPk) {
    return { success: false, error: `Ticket ${params.ticketId} missing pk.` }
  }

  // Normalize title to use ticket's display_id for consistent formatting (0121)
  const displayId = (ticket as { display_id?: string }).display_id || params.ticketId
  const canonicalTitle = createCanonicalTitle(params.artifactType, displayId)

  // Log artifact creation request for tracing
  console.log(`[agent-tools] Implementation artifact creation request: ticketId=${params.ticketId}, artifactType=${params.artifactType}, title="${params.title}", body_md length=${params.body_md?.length ?? 'undefined'}`)

  // Validate that body_md contains substantive content
  const contentValidation = validateImplementationArtifactContent(params.body_md, canonicalTitle)
  console.log(`[agent-tools] Implementation content validation: valid=${contentValidation.valid}, reason=${contentValidation.reason || 'none'}, body_md length=${params.body_md?.length ?? 'undefined'}`)
  if (!contentValidation.valid) {
    return {
      success: false,
      error: contentValidation.reason || 'Artifact body must contain substantive content, not just a title or placeholder text.',
      validation_failed: true,
    }
  }

  // Find existing artifacts by canonical identifier (ticket_pk + agent_type + artifact_type)
  // instead of exact title match to handle different title formats (0121)
  const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    'implementation',
    params.artifactType
  )

  if (findError) {
    return { success: false, error: findError }
  }

  const artifacts = (existingArtifacts || []) as Artifact[]

  // Separate artifacts into those with content and empty/placeholder ones
  const { artifactsWithContent, emptyArtifactIds } = separateArtifactsByContent(
    artifacts,
    canonicalTitle,
    false
  )

  // Delete all empty/placeholder artifacts to clean up duplicates
  const deleteResult = await deleteEmptyArtifacts(supabase, emptyArtifactIds)
  if (!deleteResult.success && deleteResult.error) {
    // Log but don't fail - we can still proceed with update/insert
    console.warn(`[agent-tools] Failed to delete empty artifacts: ${deleteResult.error}`)
  }

  // Determine which artifact to update (prefer the most recent one with content, or most recent overall)
  const targetArtifactId = selectTargetArtifact(artifacts, artifactsWithContent, emptyArtifactIds)

  if (targetArtifactId) {
    // Delete ALL other artifacts with the same canonical type (different title formats) (0121)
    const { deletedIds, error: deleteError } = await deleteDuplicateArtifacts(
      supabase,
      artifacts,
      targetArtifactId,
      emptyArtifactIds
    )

    if (deleteError) {
      // Log but don't fail - we can still proceed with update
      console.warn(`[agent-tools] Failed to delete duplicate artifacts: ${deleteError}`)
    }

    // Append to existing artifact instead of replacing (0137: preserve history when tickets are reworked)
    const existingArtifact = artifacts.find((a) => a.artifact_id === targetArtifactId)
    const existingBody = existingArtifact?.body_md || ''
    const timestamp = new Date().toISOString()
    const separator = '\n\n---\n\n'
    const appendedBody = existingBody.trim()
      ? `${existingBody.trim()}${separator}**Update (${timestamp}):**\n\n${params.body_md}`
      : params.body_md // If existing body is empty, just use new body
    
    console.log(`[agent-tools] Appending to implementation artifact ${targetArtifactId} (existing length=${existingBody.length}, new length=${params.body_md.length})`)
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: canonicalTitle, // Use canonical title for consistency
        body_md: appendedBody,
      })
      .eq('artifact_id', targetArtifactId)

    if (updateError) {
      console.error(`[agent-tools] Implementation artifact update failed: ${updateError.message}`)
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    // Verify the update by reading back the artifact
    const { data: updatedArtifact, error: readError } = await supabase
      .from('agent_artifacts')
      .select('body_md')
      .eq('artifact_id', targetArtifactId)
      .single()
    
    if (readError) {
      console.warn(`[agent-tools] Failed to read back updated implementation artifact: ${readError.message}`)
    } else {
      const persistedLength = updatedArtifact?.body_md?.length ?? 0
      console.log(`[agent-tools] Implementation artifact updated successfully. Persisted body_md length=${persistedLength}`)
    }

    return {
      success: true,
      artifact_id: targetArtifactId,
      action: 'updated',
      cleaned_up_duplicates: emptyArtifactIds.length + deletedIds.length,
    }
  }

  // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
  console.log(`[agent-tools] Inserting new implementation artifact with body_md length=${params.body_md.length}`)
  const { data: inserted, error: insertError } = await supabase
    .from('agent_artifacts')
    .insert({
      ticket_pk: ticketPk,
      repo_full_name: (ticket as { repo_full_name?: string }).repo_full_name || '',
      agent_type: 'implementation',
      title: canonicalTitle, // Use canonical title for consistency
      body_md: params.body_md,
    })
    .select('artifact_id')
    .single()

  if (insertError) {
    // Handle race condition: if duplicate key error, try to find and update the existing artifact
    if (insertError.message.includes('duplicate') || insertError.code === '23505') {
      const { data: existingArtifact, error: findError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id')
        .eq('ticket_pk', ticketPk)
        .eq('agent_type', 'implementation')
        .eq('title', params.title)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!findError && existingArtifact?.artifact_id) {
        const { error: updateError } = await supabase
          .from('agent_artifacts')
          .update({ body_md: params.body_md })
          .eq('artifact_id', existingArtifact.artifact_id)

        if (!updateError) {
          return {
            success: true,
            artifact_id: existingArtifact.artifact_id,
            action: 'updated',
            cleaned_up_duplicates: emptyArtifactIds.length,
            race_condition_handled: true,
          }
        }
      }
    }

    console.error(`[agent-tools] Implementation artifact insert failed: ${insertError.message}`)
    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    console.error(`[agent-tools] Inserted implementation artifact missing artifact_id`)
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
  }

  // Verify the insert by reading back the artifact
  const { data: insertedArtifact, error: readError } = await supabase
    .from('agent_artifacts')
    .select('body_md')
    .eq('artifact_id', insertedId)
    .single()
  
  if (readError) {
    console.warn(`[agent-tools] Failed to read back inserted implementation artifact: ${readError.message}`)
  } else {
    const persistedLength = insertedArtifact?.body_md?.length ?? 0
    console.log(`[agent-tools] Implementation artifact inserted successfully. Persisted body_md length=${persistedLength}`)
  }

  return {
    success: true,
    artifact_id: insertedId,
    action: 'inserted',
    cleaned_up_duplicates: emptyArtifactIds.length,
  }
}

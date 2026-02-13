import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { hasSubstantiveContent, hasSubstantiveQAContent } from '../artifacts/_validation.js'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from '../artifacts/_shared.js'
import { stripQABlocksFromTicketBody } from '../_lib/strip-qa-from-ticket-body.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// HAL's internal tools for Supabase operations
async function insertImplementationArtifact(
  supabase: any,
  params: { ticketId: string; artifactType: string; title: string; body_md: string }
) {
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
  const contentValidation = hasSubstantiveContent(params.body_md, canonicalTitle)
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

  const artifacts = (existingArtifacts || []) as Array<{
    artifact_id: string
    body_md?: string
    created_at: string
  }>

  // Separate artifacts into those with content and empty/placeholder ones
  const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
  const emptyArtifactIds: string[] = []

  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const currentValidation = hasSubstantiveContent(currentBody, canonicalTitle)
    if (currentValidation.valid) {
      artifactsWithContent.push({
        artifact_id: artifact.artifact_id,
        created_at: artifact.created_at,
      })
    } else {
      emptyArtifactIds.push(artifact.artifact_id)
    }
  }

  // Delete all empty/placeholder artifacts to clean up duplicates
  if (emptyArtifactIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('agent_artifacts')
      .delete()
      .in('artifact_id', emptyArtifactIds)

    if (deleteError) {
      // Log but don't fail - we can still proceed with update/insert
      console.warn(`[agent-tools] Failed to delete empty artifacts: ${deleteError.message}`)
    }
  }

  // Determine which artifact to update (prefer the most recent one with content, or most recent overall)
  let targetArtifactId: string | null = null
  if (artifactsWithContent.length > 0) {
    // Use the most recent artifact that has content
    targetArtifactId = artifactsWithContent[0].artifact_id
  } else if (artifacts.length > 0) {
    // If all were empty and we deleted them, we'll insert a new one
    // But if there's still one left (race condition), use it
    const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    if (remaining.length > 0) {
      targetArtifactId = remaining[0].artifact_id
    }
  }

  if (targetArtifactId) {
    // Delete ALL other artifacts with the same canonical type (different title formats) (0121)
    const duplicateIds = artifacts
      .map((a) => a.artifact_id)
      .filter((id) => id !== targetArtifactId && !emptyArtifactIds.includes(id))
    
    if (duplicateIds.length > 0) {
      const { error: deleteDuplicateError } = await supabase
        .from('agent_artifacts')
        .delete()
        .in('artifact_id', duplicateIds)

      if (deleteDuplicateError) {
        // Log but don't fail - we can still proceed with update
        console.warn(`[agent-tools] Failed to delete duplicate artifacts: ${deleteDuplicateError.message}`)
      }
    }

    // Update the target artifact with canonical title and new body (0121)
    console.log(`[agent-tools] Updating implementation artifact ${targetArtifactId} with body_md length=${params.body_md.length}`)
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: canonicalTitle, // Use canonical title for consistency
        body_md: params.body_md,
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
      cleaned_up_duplicates: emptyArtifactIds.length + duplicateIds.length,
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

async function insertQaArtifact(
  supabase: any,
  params: { ticketId: string; title: string; body_md: string }
) {
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
  const canonicalTitle = createCanonicalTitle('qa-report', displayId)

  // Log artifact creation request for tracing
  console.log(`[agent-tools] QA artifact creation request: ticketId=${params.ticketId}, title="${params.title}", body_md length=${params.body_md?.length ?? 'undefined'}`)

  // Validate that body_md contains substantive QA report content (use QA-specific validation)
  const contentValidation = hasSubstantiveQAContent(params.body_md, canonicalTitle)
  console.log(`[agent-tools] QA content validation: valid=${contentValidation.valid}, reason=${contentValidation.reason || 'none'}, body_md length=${params.body_md?.length ?? 'undefined'}`)
  if (!contentValidation.valid) {
    return {
      success: false,
      error: contentValidation.reason || 'Artifact body must contain substantive QA report content, not just a title or placeholder text.',
      validation_failed: true,
    }
  }

  // Find existing artifacts by canonical identifier (ticket_pk + agent_type + artifact_type)
  // instead of exact title match to handle different title formats (0121)
  const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    'qa',
    'qa-report'
  )

  if (findError) {
    return { success: false, error: findError }
  }

  const artifacts = (existingArtifacts || []) as Array<{
    artifact_id: string
    body_md?: string
    created_at: string
  }>

  // Separate artifacts into those with content and empty/placeholder ones
  const artifactsWithContent: Array<{ artifact_id: string; created_at: string }> = []
  const emptyArtifactIds: string[] = []

  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const currentValidation = hasSubstantiveContent(currentBody, canonicalTitle)
    if (currentValidation.valid) {
      artifactsWithContent.push({
        artifact_id: artifact.artifact_id,
        created_at: artifact.created_at,
      })
    } else {
      emptyArtifactIds.push(artifact.artifact_id)
    }
  }

  // Delete all empty/placeholder artifacts to clean up duplicates
  if (emptyArtifactIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('agent_artifacts')
      .delete()
      .in('artifact_id', emptyArtifactIds)

    if (deleteError) {
      // Log but don't fail - we can still proceed with update/insert
      console.warn(`[agent-tools] Failed to delete empty QA artifacts: ${deleteError.message}`)
    }
  }

  // Determine which artifact to update (prefer the most recent one with content, or most recent overall)
  let targetArtifactId: string | null = null
  if (artifactsWithContent.length > 0) {
    // Use the most recent artifact that has content
    targetArtifactId = artifactsWithContent[0].artifact_id
  } else if (artifacts.length > 0) {
    // If all were empty and we deleted them, we'll insert a new one
    // But if there's still one left (race condition), use it
    const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    if (remaining.length > 0) {
      targetArtifactId = remaining[0].artifact_id
    }
  }

  if (targetArtifactId) {
    // Delete ALL other artifacts with the same canonical type (different title formats) (0121)
    const duplicateIds = artifacts
      .map((a) => a.artifact_id)
      .filter((id) => id !== targetArtifactId && !emptyArtifactIds.includes(id))
    
    if (duplicateIds.length > 0) {
      const { error: deleteDuplicateError } = await supabase
        .from('agent_artifacts')
        .delete()
        .in('artifact_id', duplicateIds)

      if (deleteDuplicateError) {
        // Log but don't fail - we can still proceed with update
        console.warn(`[agent-tools] Failed to delete duplicate QA artifacts: ${deleteDuplicateError.message}`)
      }
    }

    // Update the target artifact with canonical title and new body (0121)
    console.log(`[agent-tools] Updating QA artifact ${targetArtifactId} with body_md length=${params.body_md.length}`)
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: canonicalTitle, // Use canonical title for consistency
        body_md: params.body_md,
      })
      .eq('artifact_id', targetArtifactId)

    if (updateError) {
      console.error(`[agent-tools] QA artifact update failed: ${updateError.message}`)
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    // Verify the update by reading back the artifact
    const { data: updatedArtifact, error: readError } = await supabase
      .from('agent_artifacts')
      .select('body_md')
      .eq('artifact_id', targetArtifactId)
      .single()
    
    if (readError) {
      console.warn(`[agent-tools] Failed to read back updated QA artifact: ${readError.message}`)
    } else {
      const persistedLength = updatedArtifact?.body_md?.length ?? 0
      console.log(`[agent-tools] QA artifact updated successfully. Persisted body_md length=${persistedLength}`)
    }

    return {
      success: true,
      artifact_id: targetArtifactId,
      action: 'updated',
      cleaned_up_duplicates: emptyArtifactIds.length + duplicateIds.length,
    }
  }

  // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
  console.log(`[agent-tools] Inserting new QA artifact with body_md length=${params.body_md.length}`)
  const { data: inserted, error: insertError } = await supabase
    .from('agent_artifacts')
    .insert({
      ticket_pk: ticketPk,
      repo_full_name: (ticket as { repo_full_name?: string }).repo_full_name || '',
      agent_type: 'qa',
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
        .eq('agent_type', 'qa')
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

    console.error(`[agent-tools] QA artifact insert failed: ${insertError.message}`)
    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    console.error(`[agent-tools] Inserted QA artifact missing artifact_id`)
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
  }

  // Verify the insert by reading back the artifact
  const { data: insertedArtifact, error: readError } = await supabase
    .from('agent_artifacts')
    .select('body_md')
    .eq('artifact_id', insertedId)
    .single()
  
  if (readError) {
    console.warn(`[agent-tools] Failed to read back inserted QA artifact: ${readError.message}`)
  } else {
    const persistedLength = insertedArtifact?.body_md?.length ?? 0
    console.log(`[agent-tools] QA artifact inserted successfully. Persisted body_md length=${persistedLength}`)
  }

  return {
    success: true,
    artifact_id: insertedId,
    action: 'inserted',
    cleaned_up_duplicates: emptyArtifactIds.length,
  }
}

async function updateTicketBody(
  supabase: any,
  params: { ticketId: string; body_md: string }
) {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, id, display_id')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError || !ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found in Supabase.` }
  }

  // Never persist QA Information / Implementation artifacts blocks; QA is artifacts only
  const bodyToStore = stripQABlocksFromTicketBody(params.body_md)
  const ticketPk = (ticket as { pk?: string }).pk
  const updateQ = supabase.from('tickets').update({ body_md: bodyToStore })
  const { error: updateError } = ticketPk
    ? await updateQ.eq('pk', ticketPk)
    : await updateQ.eq('id', params.ticketId)

  if (updateError) {
    return { success: false, error: `Supabase update failed: ${updateError.message}` }
  }

  return { success: true, ticketId: params.ticketId }
}

async function moveTicketColumn(
  supabase: any,
  params: { ticketId: string; columnId: string }
) {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, kanban_column_id, kanban_position')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError || !ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found in Supabase.` }
  }

  const ticketPk = (ticket as { pk?: string }).pk
  const repoFullName = (ticket as { repo_full_name?: string }).repo_full_name || ''
  
  // Resolve max position in target column
  const { data: inColumn, error: fetchErr } = repoFullName
    ? await supabase
        .from('tickets')
        .select('kanban_position')
        .eq('kanban_column_id', params.columnId)
        .eq('repo_full_name', repoFullName)
        .order('kanban_position', { ascending: false })
        .limit(1)
    : await supabase
        .from('tickets')
        .select('kanban_position')
        .eq('kanban_column_id', params.columnId)
        .order('kanban_position', { ascending: false })
        .limit(1)

  if (fetchErr) {
    return { success: false, error: `Failed to fetch tickets in target column: ${fetchErr.message}` }
  }

  const nextPosition = inColumn?.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
  const movedAt = new Date().toISOString()

  const updateQ = supabase
    .from('tickets')
    .update({
      kanban_column_id: params.columnId,
      kanban_position: nextPosition,
      kanban_moved_at: movedAt,
    })

  const { error: updateError } = ticketPk ? await updateQ.eq('pk', ticketPk) : await updateQ.eq('id', params.ticketId)

  if (updateError) {
    return { success: false, error: `Supabase update failed: ${updateError.message}` }
  }

  return { success: true, position: nextPosition, movedAt }
}

async function getTicketContent(
  supabase: any,
  params: { ticketId: string }
) {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, body_md')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError) {
    return { success: false, error: `Supabase fetch failed: ${ticketError.message}` }
  }

  if (!ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found.` }
  }

  return { success: true, body_md: ticket.body_md || '' }
}

/**
 * Determines if an artifact is blank (empty or placeholder-only) vs populated.
 */
function isArtifactBlank(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }

  // Use the same validation logic as hasSubstantiveContent but return boolean
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '') // Remove markdown headings
    .replace(/^[-*+]\s+.*$/gm, '') // Remove bullet points
    .replace(/^\d+\.\s+.*$/gm, '') // Remove numbered lists
    .trim()

  if (withoutHeadings.length === 0) {
    return true
  }

  // Check for minimum length
  if (withoutHeadings.length < 30) {
    return true
  }

  // Check for placeholder patterns
  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m, // Just a single heading
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return true
    }
  }

  return false
}

/**
 * Extracts a snippet from artifact body (first 200 chars of non-heading content).
 */
function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  // Remove markdown headings to get actual content
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '')
    .trim()

  if (withoutHeadings.length === 0) {
    return ''
  }

  // Take first 200 characters, breaking at word boundary if possible
  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  if (lastSpace > 150 && lastSpace < 200) {
    return snippet.substring(0, lastSpace) + '...'
  }

  return snippet.length < withoutHeadings.length ? snippet + '...' : snippet
}

async function getArtifacts(
  supabase: any,
  params: { ticketId: string; summary?: boolean }
) {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError) {
    return { success: false, error: `Supabase fetch failed: ${ticketError.message}` }
  }

  if (!ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found.` }
  }

  const ticketPk = (ticket as { pk?: string }).pk
  if (!ticketPk) {
    return { success: false, error: `Ticket ${params.ticketId} missing pk.` }
  }

  // Fetch all artifacts for this ticket
  const { data: artifacts, error: artifactsError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at, updated_at')
    .eq('ticket_pk', ticketPk)
    .order('created_at', { ascending: false })

  if (artifactsError) {
    return { success: false, error: `Failed to fetch artifacts: ${artifactsError.message}` }
  }

  const artifactsList = artifacts || []

  // If summary mode is requested, return summarized data
  if (params.summary) {
    const summarized = artifactsList.map((artifact: any) => {
      const body_md = artifact.body_md || ''
      const isBlank = isArtifactBlank(body_md, artifact.title || '')
      const snippet = extractSnippet(body_md)
      const contentLength = body_md.length

      return {
        artifact_id: artifact.artifact_id,
        agent_type: artifact.agent_type,
        title: artifact.title,
        is_blank: isBlank,
        content_length: contentLength,
        snippet: snippet,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at || artifact.created_at,
      }
    })

    // Count blank vs populated
    const blankCount = summarized.filter((a: any) => a.is_blank).length
    const populatedCount = summarized.length - blankCount

    return {
      success: true,
      artifacts: summarized,
      summary: {
        total: summarized.length,
        blank: blankCount,
        populated: populatedCount,
      },
    }
  }

  // Return full artifacts (existing behavior)
  return { success: true, artifacts: artifactsList }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      tool?: string
      params?: unknown
    }

    const tool = typeof body.tool === 'string' ? body.tool.trim() : undefined
    const params = body.params || {}

    // Log tool call request for tracing
    if (tool === 'insert_implementation_artifact' || tool === 'insert_qa_artifact') {
      const p = params as { ticketId?: string; artifactType?: string; title?: string; body_md?: string }
      console.log(`[agent-tools] Tool call received: tool=${tool}, ticketId=${p.ticketId}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md type=${typeof p.body_md}`)
    }

    if (!tool) {
      json(res, 400, {
        success: false,
        error: 'tool is required. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content, get_artifacts',
      })
      return
    }

    // Get Supabase credentials from server environment
    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 500, {
        success: false,
        error: 'Supabase credentials not configured on HAL server. Set SUPABASE_URL and SUPABASE_ANON_KEY in server environment.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Execute the requested tool
    let result: unknown
    switch (tool) {
      case 'insert_implementation_artifact': {
        const p = params as { ticketId?: string; artifactType?: string; title?: string; body_md?: string }
        console.log(`[agent-tools] Processing insert_implementation_artifact: ticketId=${p.ticketId}, artifactType=${p.artifactType}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md present=${p.body_md !== undefined && p.body_md !== null}`)
        if (!p.ticketId || !p.artifactType || !p.title || !p.body_md) {
          const missing = []
          if (!p.ticketId) missing.push('ticketId')
          if (!p.artifactType) missing.push('artifactType')
          if (!p.title) missing.push('title')
          if (!p.body_md) missing.push('body_md')
          console.error(`[agent-tools] Missing required parameters: ${missing.join(', ')}`)
          result = { success: false, error: `Missing required parameters: ${missing.join(', ')}. All of ticketId, artifactType, title, and body_md are required.` }
        } else {
          result = await insertImplementationArtifact(supabase, {
            ticketId: p.ticketId,
            artifactType: p.artifactType,
            title: p.title,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'insert_qa_artifact': {
        const p = params as { ticketId?: string; title?: string; body_md?: string }
        console.log(`[agent-tools] Processing insert_qa_artifact: ticketId=${p.ticketId}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md present=${p.body_md !== undefined && p.body_md !== null}`)
        if (!p.ticketId || !p.title || !p.body_md) {
          const missing = []
          if (!p.ticketId) missing.push('ticketId')
          if (!p.title) missing.push('title')
          if (!p.body_md) missing.push('body_md')
          console.error(`[agent-tools] Missing required parameters: ${missing.join(', ')}`)
          result = { success: false, error: `Missing required parameters: ${missing.join(', ')}. All of ticketId, title, and body_md are required.` }
        } else {
          result = await insertQaArtifact(supabase, {
            ticketId: p.ticketId,
            title: p.title,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'update_ticket_body': {
        const p = params as { ticketId?: string; body_md?: string }
        if (!p.ticketId || !p.body_md) {
          result = { success: false, error: 'ticketId and body_md are required.' }
        } else {
          result = await updateTicketBody(supabase, {
            ticketId: p.ticketId,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'move_ticket_column': {
        const p = params as { ticketId?: string; columnId?: string }
        if (!p.ticketId || !p.columnId) {
          result = { success: false, error: 'ticketId and columnId are required.' }
        } else {
          result = await moveTicketColumn(supabase, {
            ticketId: p.ticketId,
            columnId: p.columnId,
          })
        }
        break
      }
      case 'get_ticket_content': {
        const p = params as { ticketId?: string }
        if (!p.ticketId) {
          result = { success: false, error: 'ticketId is required.' }
        } else {
          result = await getTicketContent(supabase, {
            ticketId: p.ticketId,
          })
        }
        break
      }
      case 'get_artifacts': {
        const p = params as { ticketId?: string; summary?: boolean }
        if (!p.ticketId) {
          result = { success: false, error: 'ticketId is required.' }
        } else {
          result = await getArtifacts(supabase, {
            ticketId: p.ticketId,
            summary: p.summary === true,
          })
        }
        break
      }
      default:
        result = {
          success: false,
          error: `Unknown tool: ${tool}. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content, get_artifacts`,
        }
    }

    json(res, 200, result)
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

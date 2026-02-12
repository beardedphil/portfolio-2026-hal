import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { hasSubstantiveContent } from '../artifacts/_validation'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from '../artifacts/_shared'

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

  // Validate that body_md contains substantive content
  const contentValidation = hasSubstantiveContent(params.body_md, canonicalTitle)
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
    // Update the target artifact with canonical title and new body (0121)
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: canonicalTitle, // Use canonical title for consistency
        body_md: params.body_md,
      })
      .eq('artifact_id', targetArtifactId)

    if (updateError) {
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    return {
      success: true,
      artifact_id: targetArtifactId,
      action: 'updated',
      cleaned_up_duplicates: emptyArtifactIds.length,
    }
  }

  // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
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

    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
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

  // Validate that body_md contains substantive content
  const contentValidation = hasSubstantiveContent(params.body_md, canonicalTitle)
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
    // Update the target artifact with canonical title and new body (0121)
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: canonicalTitle, // Use canonical title for consistency
        body_md: params.body_md,
      })
      .eq('artifact_id', targetArtifactId)

    if (updateError) {
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    return {
      success: true,
      artifact_id: targetArtifactId,
      action: 'updated',
      cleaned_up_duplicates: emptyArtifactIds.length,
    }
  }

  // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
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

    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
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

  const ticketPk = (ticket as { pk?: string }).pk
  const updateQ = supabase.from('tickets').update({ body_md: params.body_md })
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

async function getArtifacts(
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
    .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
    .eq('ticket_pk', ticketPk)
    .order('created_at', { ascending: false })

  if (artifactsError) {
    return { success: false, error: `Failed to fetch artifacts: ${artifactsError.message}` }
  }

  return { success: true, artifacts: artifacts || [] }
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
        if (!p.ticketId || !p.artifactType || !p.title || !p.body_md) {
          result = { success: false, error: 'ticketId, artifactType, title, and body_md are required.' }
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
        if (!p.ticketId || !p.title || !p.body_md) {
          result = { success: false, error: 'ticketId, title, and body_md are required.' }
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
        const p = params as { ticketId?: string }
        if (!p.ticketId) {
          result = { success: false, error: 'ticketId is required.' }
        } else {
          result = await getArtifacts(supabase, {
            ticketId: p.ticketId,
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

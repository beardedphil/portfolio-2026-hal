import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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

  // Check if artifact already exists
  const { data: existing } = await supabase
    .from('agent_artifacts')
    .select('artifact_id')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', 'implementation')
    .eq('title', params.title)
    .maybeSingle()

  if (existing) {
    const existingId = (existing as { artifact_id?: string }).artifact_id
    if (!existingId) {
      return { success: false, error: 'Existing artifact missing artifact_id.' }
    }
    
    // Update existing artifact
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: params.title,
        body_md: params.body_md,
      })
      .eq('artifact_id', existingId)

    if (updateError) {
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    return { success: true, artifact_id: existingId, action: 'updated' }
  }

  // Insert new artifact
  const { data: inserted, error: insertError } = await supabase
    .from('agent_artifacts')
    .insert({
      ticket_pk: ticketPk,
      repo_full_name: (ticket as { repo_full_name?: string }).repo_full_name || '',
      agent_type: 'implementation',
      title: params.title,
      body_md: params.body_md,
    })
    .select('artifact_id')
    .single()

  if (insertError) {
    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
  }

  return { success: true, artifact_id: insertedId, action: 'inserted' }
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

  // Check if artifact already exists
  const { data: existing } = await supabase
    .from('agent_artifacts')
    .select('artifact_id')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', 'qa')
    .eq('title', params.title)
    .maybeSingle()

  if (existing) {
    const existingId = (existing as { artifact_id?: string }).artifact_id
    if (!existingId) {
      return { success: false, error: 'Existing artifact missing artifact_id.' }
    }
    
    // Update existing artifact
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: params.title,
        body_md: params.body_md,
      })
      .eq('artifact_id', existingId)

    if (updateError) {
      return { success: false, error: `Failed to update artifact: ${updateError.message}` }
    }

    return { success: true, artifact_id: existingId, action: 'updated' }
  }

  // Insert new artifact
  const { data: inserted, error: insertError } = await supabase
    .from('agent_artifacts')
    .insert({
      ticket_pk: ticketPk,
      repo_full_name: (ticket as { repo_full_name?: string }).repo_full_name || '',
      agent_type: 'qa',
      title: params.title,
      body_md: params.body_md,
    })
    .select('artifact_id')
    .single()

  if (insertError) {
    return { success: false, error: `Failed to insert artifact: ${insertError.message}` }
  }

  const insertedId = (inserted as { artifact_id?: string }).artifact_id
  if (!insertedId) {
    return { success: false, error: 'Inserted artifact missing artifact_id.' }
  }

  return { success: true, artifact_id: insertedId, action: 'inserted' }
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
        error: 'tool is required. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content',
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
      default:
        result = {
          success: false,
          error: `Unknown tool: ${tool}. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content`,
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

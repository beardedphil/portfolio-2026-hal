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
      ticketId?: string
      title?: string
      body_md?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const body_md = typeof body.body_md === 'string' ? body.body_md : undefined

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!ticketId || !title || !body_md) {
      json(res, 400, {
        success: false,
        error: 'ticketId, title, and body_md are required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get ticket to retrieve pk and repo_full_name
    const ticketNumber = parseInt(ticketId, 10)
    if (!Number.isFinite(ticketNumber)) {
      json(res, 400, {
        success: false,
        error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
      })
      return
    }

    // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, display_id')
      .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
      .maybeSingle()

    if (ticketError || !ticket) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId} not found in Supabase.`,
      })
      return
    }

    // Check if artifact already exists
    const { data: existing } = await supabase
      .from('agent_artifacts')
      .select('artifact_id')
      .eq('ticket_pk', ticket.pk)
      .eq('agent_type', 'qa')
      .eq('title', title)
      .maybeSingle()

    if (existing) {
      // Update existing artifact
      const { error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          title,
          body_md,
        })
        .eq('artifact_id', existing.artifact_id)

      if (updateError) {
        json(res, 200, {
          success: false,
          error: `Failed to update artifact: ${updateError.message}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        artifact_id: existing.artifact_id,
        action: 'updated',
      })
      return
    }

    // Insert new artifact
    const { data: inserted, error: insertError } = await supabase
      .from('agent_artifacts')
      .insert({
        ticket_pk: ticket.pk,
        repo_full_name: ticket.repo_full_name || '',
        agent_type: 'qa',
        title,
        body_md,
      })
      .select('artifact_id')
      .single()

    if (insertError) {
      json(res, 200, {
        success: false,
        error: `Failed to insert artifact: ${insertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      artifact_id: inserted.artifact_id,
      action: 'inserted',
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

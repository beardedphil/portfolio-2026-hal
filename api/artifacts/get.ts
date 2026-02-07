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
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined

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

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
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

    // If ticketId provided, look up ticket to get pk
    let finalTicketPk = ticketPk
    if (!finalTicketPk && ticketId) {
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
        .select('pk')
        .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
        .maybeSingle()

      if (ticketError || !ticket) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId} not found in Supabase.`,
          artifacts: [],
        })
        return
      }

      finalTicketPk = ticket.pk
    }

    if (!finalTicketPk) {
      json(res, 400, {
        success: false,
        error: 'Could not determine ticket PK.',
        artifacts: [],
      })
      return
    }

    // Fetch all artifacts for this ticket
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
      .eq('ticket_pk', finalTicketPk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
        artifacts: [],
      })
      return
    }

    json(res, 200, {
      success: true,
      artifacts: artifacts || [],
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      artifacts: [],
    })
  }
}

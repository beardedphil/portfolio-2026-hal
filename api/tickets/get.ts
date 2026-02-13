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
  // CORS: Allow cross-origin requests (for scripts calling from different origins)
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

    // Fetch full ticket record (select all fields for forward compatibility)
    const fetch = ticketPk
      ? await supabase.from('tickets').select('*').eq('pk', ticketPk).maybeSingle()
      : await supabase.from('tickets').select('*').eq('id', ticketId!).maybeSingle()

    if (fetch.error) {
      json(res, 200, { success: false, error: `Supabase fetch failed: ${fetch.error.message}` })
      return
    }

    if (!fetch.data) {
      json(res, 200, { success: false, error: `Ticket ${ticketId || ticketPk} not found.` })
      return
    }

    const ticket = fetch.data
    const ticketPkValue = ticket.pk || (ticketPk ? ticketPk : undefined)

    // If we have a ticket PK, fetch artifacts
    let artifacts: any[] = []
    let artifactsError: string | null = null
    if (ticketPkValue) {
      try {
        const { data: artifactsData, error: artifactsErr } = await supabase
          .from('agent_artifacts')
          .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
          .eq('ticket_pk', ticketPkValue)
          .order('created_at', { ascending: false })

        if (artifactsErr) {
          artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
        } else {
          artifacts = artifactsData || []
        }
      } catch (err) {
        artifactsError = err instanceof Error ? err.message : String(err)
      }
    }

    // Return full ticket record with artifacts
    // Forward-compatible: return all ticket fields, not just specific ones
    json(res, 200, {
      success: true,
      ticket: ticket, // Full ticket record (all fields)
      artifacts: artifacts, // Array of artifacts
      ...(artifactsError ? { artifacts_error: artifactsError } : {}), // Include error if artifacts fetch failed
      // Backward compatibility: also include body_md at top level
      body_md: ticket.body_md || '',
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

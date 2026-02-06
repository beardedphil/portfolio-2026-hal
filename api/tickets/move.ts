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
      columnId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const columnId = typeof body.columnId === 'string' ? body.columnId.trim() || undefined : undefined
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

    if ((!ticketId && !ticketPk) || !columnId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId, and columnId are required.',
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

    // Resolve max position in target column so we append at end
    const { data: inColumn, error: fetchErr } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', columnId)
      .order('kanban_position', { ascending: false })
      .limit(1)

    if (fetchErr) {
      json(res, 200, { success: false, error: `Failed to fetch tickets in target column: ${fetchErr.message}` })
      return
    }

    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
    const movedAt = new Date().toISOString()

    const update = ticketPk
      ? await supabase
          .from('tickets')
          .update({
            kanban_column_id: columnId,
            kanban_position: nextPosition,
            kanban_moved_at: movedAt,
          })
          .eq('pk', ticketPk)
      : await supabase
          .from('tickets')
          .update({
            kanban_column_id: columnId,
            kanban_position: nextPosition,
            kanban_moved_at: movedAt,
          })
          .eq('id', ticketId!)

    if (update.error) {
      json(res, 200, { success: false, error: `Supabase update failed: ${update.error.message}` })
      return
    }

    json(res, 200, {
      success: true,
      position: nextPosition,
      movedAt,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

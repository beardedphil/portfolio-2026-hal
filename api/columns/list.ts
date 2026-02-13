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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

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

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
        columns: [],
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all columns ordered by position
    const { data: columns, error } = await supabase
      .from('kanban_columns')
      .select('id, title, position')
      .order('position', { ascending: true })

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch columns: ${error.message}`,
        columns: [],
      })
      return
    }

    // Build name to ID mapping
    const nameToId: Record<string, string> = {}
    const columnsList = (columns || []).map((col: any) => {
      const id = col.id || ''
      const title = col.title || ''
      const position = col.position ?? 0
      
      // Map title to ID (case-insensitive, with common variations)
      const normalizedTitle = title.toLowerCase().trim()
      nameToId[normalizedTitle] = id
      // Also map common variations
      if (normalizedTitle === 'to-do' || normalizedTitle === 'todo') {
        nameToId['to do'] = id
        nameToId['todo'] = id
      }
      if (normalizedTitle === 'ready for qa' || normalizedTitle === 'qa') {
        nameToId['qa'] = id
        nameToId['ready for qa'] = id
      }
      if (normalizedTitle === 'human in the loop') {
        nameToId['human in the loop'] = id
        nameToId['hitl'] = id
      }
      
      return { id, title, position }
    })

    json(res, 200, {
      success: true,
      columns: columnsList,
      nameToId,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      columns: [],
    })
  }
}

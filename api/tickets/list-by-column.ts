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

function clampInt(n: unknown, { min, max, fallback }: { min: number; max: number; fallback: number }) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  const i = Math.floor(n)
  return Math.min(max, Math.max(min, i))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests (scripts + local tools).
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
      columnId?: string
      columnName?: string
      repoFullName?: string
      includeBody?: boolean
      limit?: number
      offset?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    let columnId = typeof body.columnId === 'string' ? body.columnId.trim() || undefined : undefined
    const columnName = typeof body.columnName === 'string' ? body.columnName.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const includeBody = body.includeBody === true
    const limit = clampInt(body.limit, { min: 1, max: 1000, fallback: 200 })
    const offset = clampInt(body.offset, { min: 0, max: 100000, fallback: 0 })

    if (!columnId && !columnName) {
      json(res, 400, { success: false, error: 'columnId or columnName is required.' })
      return
    }

    // Use credentials from request body if provided, otherwise fall back to server environment variables.
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error:
          'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Resolve columnName → columnId if needed.
    if (!columnId && columnName) {
      const { data: columns, error: colErr } = await supabase.from('kanban_columns').select('id, title')
      if (colErr) {
        json(res, 200, { success: false, error: `Failed to fetch columns: ${colErr.message}` })
        return
      }

      const normalizedName = columnName.toLowerCase().trim()
      const matchedColumn = (columns || []).find((col: any) => {
        const normalizedTitle = String(col.title || '').toLowerCase().trim()
        return (
          normalizedTitle === normalizedName ||
          (normalizedName === 'todo' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
          (normalizedName === 'to do' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
          (normalizedName === 'qa' && normalizedTitle.includes('qa')) ||
          (normalizedName === 'ready for qa' && normalizedTitle.includes('qa')) ||
          (normalizedName === 'human in the loop' && normalizedTitle.includes('human')) ||
          (normalizedName === 'hitl' && normalizedTitle.includes('human'))
        )
      })

      if (!matchedColumn?.id) {
        json(res, 200, {
          success: false,
          error: `Column "${columnName}" not found. Available columns: ${(columns || []).map((c: any) => c.title).join(', ')}`,
        })
        return
      }

      columnId = matchedColumn.id
    }

    if (!columnId) {
      json(res, 400, { success: false, error: 'Column ID is required but was not resolved.' })
      return
    }

    const selectFields = [
      'pk',
      'id',
      'display_id',
      'title',
      'repo_full_name',
      'kanban_column_id',
      'kanban_position',
      'kanban_moved_at',
      ...(includeBody ? ['body_md'] : []),
    ].join(', ')

    let q = supabase
      .from('tickets')
      .select(selectFields, { count: 'exact' })
      .eq('kanban_column_id', columnId)
      .order('kanban_position', { ascending: true })
      .range(offset, offset + limit - 1)

    if (repoFullName) q = q.eq('repo_full_name', repoFullName)

    const { data: tickets, error, count } = await q

    if (error) {
      json(res, 200, { success: false, error: `Failed to fetch tickets: ${error.message}` })
      return
    }

    json(res, 200, {
      success: true,
      columnId,
      ...(columnName ? { columnName } : {}),
      ...(repoFullName ? { repoFullName } : {}),
      count: count ?? (tickets || []).length,
      tickets: tickets || [],
      limit,
      offset,
      includeBody,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}


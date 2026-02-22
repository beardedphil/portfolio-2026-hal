import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export interface AuditLogEntry {
  id: string
  project_id: string
  action_type: string
  action_status: string
  summary: string
  details: unknown | null
  provider_name: string | null
  related_entity_id: string | null
  created_at: string
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' })
  }

  try {
    const chunks: Uint8Array[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    const body = raw
      ? (JSON.parse(raw) as {
          projectId: string
          actionType?: string
          limit?: number
          supabaseUrl?: string
          supabaseAnonKey?: string
        })
      : {}

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined

    if (!projectId) {
      return json(res, 400, {
        success: false,
        error: 'projectId is required',
      })
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

    // Build query
    let query = supabase
      .from('project_audit_log')
      .select('*')
      .eq('project_id', projectId)

    // Filter by action type if provided
    if (body.actionType && typeof body.actionType === 'string') {
      query = query.eq('action_type', body.actionType)
    }

    // Order by created_at descending (newest first) and limit
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 100
    query = query.order('created_at', { ascending: false }).limit(limit)

    const { data: entries, error } = await query

    if (error) {
      console.error('Error fetching audit log:', error)
      return json(res, 500, {
        success: false,
        error: `Database error: ${error.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      entries: (entries || []) as AuditLogEntry[],
    })
  } catch (err) {
    console.error('Error in get audit log handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

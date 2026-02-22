import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export interface ProviderConnection {
  id: string
  project_id: string
  provider_name: string
  provider_type: string
  connected_at: string
  disconnected_at: string | null
  revocation_supported: boolean
  revocation_status: string | null
  revocation_error: string | null
  created_at: string
  updated_at: string
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
    const body = raw ? (JSON.parse(raw) as { projectId: string; supabaseUrl?: string; supabaseAnonKey?: string }) : {}

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

    // Get all connections for this project (both active and disconnected)
    const { data: connections, error } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching provider connections:', error)
      return json(res, 500, {
        success: false,
        error: `Database error: ${error.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      connections: (connections || []) as ProviderConnection[],
    })
  } catch (err) {
    console.error('Error in list providers handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

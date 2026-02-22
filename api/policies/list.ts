import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

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

    // Use service role key (preferred) to bypass RLS, fall back to anon key if not available
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all policies with their status
    const { data: policies, error: policiesError } = await supabase
      .from('policies')
      .select('*')
      .order('name', { ascending: true })

    if (policiesError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch policies: ${policiesError.message}`,
      })
      return
    }

    // Fetch all policy statuses
    const { data: statuses, error: statusesError } = await supabase
      .from('policy_status')
      .select('*')

    if (statusesError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch policy statuses: ${statusesError.message}`,
      })
      return
    }

    // Combine policies with their statuses
    const policiesWithStatus = (policies || []).map((policy) => {
      const status = (statuses || []).find((s) => s.policy_id === policy.policy_id)
      return {
        ...policy,
        status: status?.status || 'off',
        last_changed_at: status?.last_changed_at || null,
        last_changed_by: status?.last_changed_by || null,
      }
    })

    json(res, 200, {
      success: true,
      policies: policiesWithStatus,
    })
  } catch (err) {
    console.error('[api/policies/list] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

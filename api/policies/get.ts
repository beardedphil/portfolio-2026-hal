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
      policyId: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const policyId = typeof body.policyId === 'string' ? body.policyId.trim() : undefined

    if (!policyId) {
      json(res, 400, {
        success: false,
        error: 'policyId is required.',
      })
      return
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

    // Fetch policy
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('*')
      .eq('policy_id', policyId)
      .single()

    if (policyError) {
      if (policyError.code === 'PGRST116') {
        json(res, 200, {
          success: false,
          error: 'Policy not found.',
        })
        return
      }
      json(res, 200, {
        success: false,
        error: `Failed to fetch policy: ${policyError.message}`,
      })
      return
    }

    // Fetch policy status
    const { data: status, error: statusError } = await supabase
      .from('policy_status')
      .select('*')
      .eq('policy_id', policyId)
      .single()

    if (statusError && statusError.code !== 'PGRST116') {
      json(res, 200, {
        success: false,
        error: `Failed to fetch policy status: ${statusError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      policy: {
        ...policy,
        status: status?.status || 'off',
        last_changed_at: status?.last_changed_at || null,
        last_changed_by: status?.last_changed_by || null,
      },
    })
  } catch (err) {
    console.error('[api/policies/get] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

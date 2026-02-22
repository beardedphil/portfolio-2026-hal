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
      policyId?: string
      policyKey?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    if (!body.policyId && !body.policyKey) {
      json(res, 400, {
        success: false,
        error: 'Either policyId or policyKey is required',
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

    // Fetch policy to get policy_id
    let query = supabase.from('policies').select('id')
    if (body.policyId) {
      query = query.eq('id', body.policyId)
    } else if (body.policyKey) {
      query = query.eq('policy_key', body.policyKey)
    }

    const { data: policies, error: fetchError } = await query

    if (fetchError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch policy: ${fetchError.message}`,
      })
      return
    }

    if (!policies || policies.length === 0) {
      json(res, 200, {
        success: false,
        error: 'Policy not found',
      })
      return
    }

    const policyId = policies[0].id
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 10

    // Fetch most recent metrics for this policy
    const { data: metrics, error: metricsError } = await supabase
      .from('policy_metrics')
      .select('*')
      .eq('policy_id', policyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (metricsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch metrics: ${metricsError.message}`,
      })
      return
    }

    // If no metrics exist, return empty array with a default structure
    if (!metrics || metrics.length === 0) {
      json(res, 200, {
        success: true,
        metrics: [],
        summary: {
          events_in_baseline_window: 0,
          events_in_trial_window: 0,
        },
      })
      return
    }

    // Calculate summary (use most recent metric)
    const latestMetric = metrics[0]
    const summary = {
      events_in_baseline_window: latestMetric.events_in_baseline_window || 0,
      events_in_trial_window: latestMetric.events_in_trial_window || 0,
    }

    json(res, 200, {
      success: true,
      metrics: metrics || [],
      summary,
    })
  } catch (err) {
    console.error('[api/policies/metrics] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

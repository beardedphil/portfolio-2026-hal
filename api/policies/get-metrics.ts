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

    // Get policy to check baseline/trial windows
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('*')
      .eq('id', policyId)
      .single()

    if (policyError || !policy) {
      json(res, 200, {
        success: false,
        error: 'Policy not found.',
      })
      return
    }

    // Get baseline metrics
    let baselineMetrics = null
    if (policy.baseline_window_start && policy.baseline_window_end) {
      const { data: baseline, error: baselineError } = await supabase
        .from('policy_metrics')
        .select('*')
        .eq('policy_id', policyId)
        .eq('window_type', 'baseline')
        .gte('window_start', policy.baseline_window_start)
        .lte('window_end', policy.baseline_window_end)
        .order('window_start', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!baselineError && baseline) {
        baselineMetrics = baseline
      } else {
        // If no metrics exist, create a placeholder with 0 events
        baselineMetrics = {
          event_count: 0,
          window_start: policy.baseline_window_start,
          window_end: policy.baseline_window_end,
        }
      }
    }

    // Get trial metrics
    let trialMetrics = null
    if (policy.status === 'trial' && policy.trial_started_at) {
      const { data: trial, error: trialError } = await supabase
        .from('policy_metrics')
        .select('*')
        .eq('policy_id', policyId)
        .eq('window_type', 'trial')
        .gte('window_start', policy.trial_started_at)
        .order('window_start', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!trialError && trial) {
        trialMetrics = trial
      } else {
        // If no metrics exist, create a placeholder with 0 events
        trialMetrics = {
          event_count: 0,
          window_start: policy.trial_started_at,
          window_end: new Date().toISOString(),
        }
      }
    }

    json(res, 200, {
      success: true,
      metrics: {
        baseline: baselineMetrics,
        trial: trialMetrics,
      },
    })
  } catch (err) {
    console.error('[api/policies/get-metrics] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

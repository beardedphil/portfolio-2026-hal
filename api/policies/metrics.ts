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

    // Get the most recent metrics for baseline and trial windows
    const { data: baselineMetrics, error: baselineError } = await supabase
      .from('policy_metrics')
      .select('*')
      .eq('policy_id', policyId)
      .eq('window_type', 'baseline')
      .order('window_start', { ascending: false })
      .limit(1)

    if (baselineError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch baseline metrics: ${baselineError.message}`,
      })
      return
    }

    const { data: trialMetrics, error: trialError } = await supabase
      .from('policy_metrics')
      .select('*')
      .eq('policy_id', policyId)
      .eq('window_type', 'trial')
      .order('window_start', { ascending: false })
      .limit(1)

    if (trialError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch trial metrics: ${trialError.message}`,
      })
      return
    }

    // Calculate totals (sum of all events in each window type)
    const { data: allBaselineMetrics, error: allBaselineError } = await supabase
      .from('policy_metrics')
      .select('event_count')
      .eq('policy_id', policyId)
      .eq('window_type', 'baseline')

    if (allBaselineError) {
      json(res, 200, {
        success: false,
        error: `Failed to calculate baseline total: ${allBaselineError.message}`,
      })
      return
    }

    const { data: allTrialMetrics, error: allTrialError } = await supabase
      .from('policy_metrics')
      .select('event_count')
      .eq('policy_id', policyId)
      .eq('window_type', 'trial')

    if (allTrialError) {
      json(res, 200, {
        success: false,
        error: `Failed to calculate trial total: ${allTrialError.message}`,
      })
      return
    }

    const baselineTotal = (allBaselineMetrics || []).reduce((sum, m) => sum + (m.event_count || 0), 0)
    const trialTotal = (allTrialMetrics || []).reduce((sum, m) => sum + (m.event_count || 0), 0)

    json(res, 200, {
      success: true,
      metrics: {
        baseline: {
          events_in_window: baselineTotal,
          latest_window: baselineMetrics?.[0] || null,
        },
        trial: {
          events_in_window: trialTotal,
          latest_window: trialMetrics?.[0] || null,
        },
      },
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

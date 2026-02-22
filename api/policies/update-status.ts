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
      action: 'start_trial' | 'promote' | 'revert'
      actor?: string
      actorType?: 'system' | 'user'
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const policyId = typeof body.policyId === 'string' ? body.policyId.trim() : undefined
    const action = body.action
    const actor = typeof body.actor === 'string' ? body.actor.trim() : 'system'
    const actorType = body.actorType || 'system'

    if (!policyId) {
      json(res, 400, {
        success: false,
        error: 'policyId is required.',
      })
      return
    }

    if (!action || !['start_trial', 'promote', 'revert'].includes(action)) {
      json(res, 400, {
        success: false,
        error: 'action must be one of: start_trial, promote, revert.',
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

    // Get current policy state
    const { data: currentPolicy, error: fetchError } = await supabase
      .from('policies')
      .select('*')
      .eq('id', policyId)
      .single()

    if (fetchError || !currentPolicy) {
      json(res, 200, {
        success: false,
        error: 'Policy not found.',
      })
      return
    }

    const fromStatus = currentPolicy.status
    let toStatus: 'off' | 'trial' | 'promoted'
    let trialStartedAt: string | null = currentPolicy.trial_started_at
    let baselineWindowStart: string | null = currentPolicy.baseline_window_start
    let baselineWindowEnd: string | null = currentPolicy.baseline_window_end

    // Determine new status based on action
    if (action === 'start_trial') {
      if (fromStatus !== 'off') {
        json(res, 200, {
          success: false,
          error: `Cannot start trial: policy is currently ${fromStatus}, must be 'off'.`,
        })
        return
      }
      toStatus = 'trial'
      const now = new Date().toISOString()
      trialStartedAt = now
      // Set baseline window to 7 days before trial start (or policy creation, whichever is later)
      const baselineStart = new Date(Math.max(
        new Date(currentPolicy.created_at).getTime(),
        new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000
      )).toISOString()
      baselineWindowStart = baselineStart
      baselineWindowEnd = now
    } else if (action === 'promote') {
      if (fromStatus !== 'trial') {
        json(res, 200, {
          success: false,
          error: `Cannot promote: policy is currently ${fromStatus}, must be 'trial'.`,
        })
        return
      }
      toStatus = 'promoted'
      // Keep trial_started_at for historical reference
    } else if (action === 'revert') {
      if (fromStatus !== 'trial') {
        json(res, 200, {
          success: false,
          error: `Cannot revert: policy is currently ${fromStatus}, must be 'trial'.`,
        })
        return
      }
      toStatus = 'off'
      trialStartedAt = null
      baselineWindowStart = null
      baselineWindowEnd = null
    } else {
      json(res, 400, {
        success: false,
        error: 'Invalid action.',
      })
      return
    }

    // Update policy status
    const { data: updatedPolicy, error: updateError } = await supabase
      .from('policies')
      .update({
        status: toStatus,
        last_changed_at: new Date().toISOString(),
        last_changed_by: actor,
        trial_started_at: trialStartedAt,
        baseline_window_start: baselineWindowStart,
        baseline_window_end: baselineWindowEnd,
      })
      .eq('id', policyId)
      .select()
      .single()

    if (updateError) {
      json(res, 200, {
        success: false,
        error: `Failed to update policy: ${updateError.message}`,
      })
      return
    }

    // Create audit log entry
    const { error: auditError } = await supabase.from('policy_audit_log').insert({
      policy_id: policyId,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      actor,
      actor_type: actorType,
      metadata: {},
    })

    if (auditError) {
      console.error('[api/policies/update-status] Failed to create audit log:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    json(res, 200, {
      success: true,
      policy: updatedPolicy,
    })
  } catch (err) {
    console.error('[api/policies/update-status] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

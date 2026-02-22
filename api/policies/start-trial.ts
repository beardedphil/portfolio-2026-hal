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
      actor?: string
      actorType?: 'system' | 'user'
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

    // Fetch current policy
    let query = supabase.from('policies').select('*')
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

    const policy = policies[0]

    // Check if already in trial or promoted
    if (policy.status === 'trial') {
      json(res, 200, {
        success: false,
        error: 'Policy is already in trial',
      })
      return
    }

    if (policy.status === 'promoted') {
      json(res, 200, {
        success: false,
        error: 'Policy is already promoted. Revert it first to start a new trial.',
      })
      return
    }

    const previousStatus = policy.status
    const now = new Date().toISOString()

    // Update policy status to 'trial'
    const { data: updatedPolicy, error: updateError } = await supabase
      .from('policies')
      .update({
        status: 'trial',
        last_changed_at: now,
      })
      .eq('id', policy.id)
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
    const actor = body.actor || 'system'
    const actorType = body.actorType || 'system'

    const { error: auditError } = await supabase.from('policy_audit_log').insert({
      policy_id: policy.id,
      action: 'start_trial',
      target_status: 'trial',
      previous_status: previousStatus,
      actor,
      actor_type: actorType,
    })

    if (auditError) {
      console.error('[api/policies/start-trial] Failed to create audit log:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    json(res, 200, {
      success: true,
      policy: updatedPolicy,
    })
  } catch (err) {
    console.error('[api/policies/start-trial] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (!res.headersSent) {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}

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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const policyId = typeof body.policyId === 'string' ? body.policyId.trim() : undefined
    const action = body.action
    const actor = typeof body.actor === 'string' ? body.actor.trim() : 'system'

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

    // Determine new status based on action
    let newStatus: 'off' | 'trial' | 'promoted'
    let actionName: string
    if (action === 'start_trial') {
      newStatus = 'trial'
      actionName = 'start_trial'
    } else if (action === 'promote') {
      newStatus = 'promoted'
      actionName = 'promote'
    } else {
      newStatus = 'off'
      actionName = 'revert'
    }

    // Get current status
    const { data: currentStatus, error: currentStatusError } = await supabase
      .from('policy_status')
      .select('*')
      .eq('policy_id', policyId)
      .single()

    if (currentStatusError && currentStatusError.code !== 'PGRST116') {
      json(res, 200, {
        success: false,
        error: `Failed to fetch current status: ${currentStatusError.message}`,
      })
      return
    }

    const fromStatus = currentStatus?.status || 'off'

    // Update or insert policy status
    const { data: updatedStatus, error: updateError } = await supabase
      .from('policy_status')
      .upsert(
        {
          policy_id: policyId,
          status: newStatus,
          last_changed_at: new Date().toISOString(),
          last_changed_by: actor,
        },
        { onConflict: 'policy_id' }
      )
      .select()
      .single()

    if (updateError) {
      json(res, 200, {
        success: false,
        error: `Failed to update policy status: ${updateError.message}`,
      })
      return
    }

    // Record in audit log
    const { error: auditError } = await supabase.from('policy_audit_log').insert({
      policy_id: policyId,
      action: actionName,
      from_status: fromStatus,
      to_status: newStatus,
      actor: actor,
      timestamp: new Date().toISOString(),
    })

    if (auditError) {
      console.error('[api/policies/update-status] Failed to record audit log:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    json(res, 200, {
      success: true,
      policy: {
        policy_id: policyId,
        status: newStatus,
        last_changed_at: updatedStatus?.last_changed_at || null,
        last_changed_by: updatedStatus?.last_changed_by || null,
      },
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

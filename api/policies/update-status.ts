import type { IncomingMessage, ServerResponse } from 'http'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { createClient } from '@supabase/supabase-js'

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

async function handleWebRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const body = (await request.json()) as {
      policyId: string
      action: 'start_trial' | 'promote' | 'revert'
      actor?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    if (!body.policyId || !body.action) {
      return Response.json({ success: false, error: 'Missing required fields: policyId, action' }, { status: 400 })
    }

    if (!['start_trial', 'promote', 'revert'].includes(body.action)) {
      return Response.json({ success: false, error: 'Invalid action. Must be: start_trial, promote, or revert' }, { status: 400 })
    }

    const creds = parseSupabaseCredentialsWithServiceRole({
      supabaseUrl: body.supabaseUrl,
      supabaseAnonKey: body.supabaseAnonKey,
    })
    if (!creds.supabaseUrl || !creds.supabaseKey) {
      return Response.json({ success: false, error: 'Missing Supabase credentials' }, { status: 400 })
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseKey)

    // Get current policy
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('*')
      .eq('id', body.policyId)
      .single()

    if (policyError || !policy) {
      return Response.json({ success: false, error: 'Policy not found' }, { status: 404 })
    }

    // Determine new status based on action
    let newStatus: 'off' | 'trial' | 'promoted'
    let actionType: string
    if (body.action === 'start_trial') {
      if (policy.status !== 'off') {
        return Response.json({ success: false, error: 'Can only start trial from Off status' }, { status: 400 })
      }
      newStatus = 'trial'
      actionType = 'start_trial'
    } else if (body.action === 'promote') {
      if (policy.status !== 'trial') {
        return Response.json({ success: false, error: 'Can only promote from Trial status' }, { status: 400 })
      }
      newStatus = 'promoted'
      actionType = 'promote'
    } else {
      // revert
      if (policy.status === 'off') {
        return Response.json({ success: false, error: 'Policy is already Off' }, { status: 400 })
      }
      newStatus = 'off'
      actionType = 'revert'
    }

    // Update policy status
    const { data: updatedPolicy, error: updateError } = await supabase
      .from('policies')
      .update({
        status: newStatus,
        last_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.policyId)
      .select()
      .single()

    if (updateError || !updatedPolicy) {
      return Response.json({ success: false, error: updateError?.message || 'Failed to update policy' }, { status: 500 })
    }

    // Create audit log entry
    const { error: auditError } = await supabase.from('policy_audit_logs').insert({
      policy_id: body.policyId,
      action: actionType,
      from_status: policy.status,
      to_status: newStatus,
      actor: body.actor || 'system',
    })

    if (auditError) {
      console.error('[api/policies/update-status] Failed to create audit log:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    return Response.json(
      {
        success: true,
        policy: updatedPolicy,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/update-status] POST', msg, err)
    return Response.json({ success: false, error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/update-status] POST', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/policies/update-status] response object missing (received only one argument)')
    throw new Error('Policies update-status: response object missing')
  }
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Cache-Control', 'no-store')
      res.end('Method Not Allowed')
      return
    }

    const chunks: Uint8Array[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    const body = raw
      ? (JSON.parse(raw) as {
          policyId: string
          action: 'start_trial' | 'promote' | 'revert'
          actor?: string
          supabaseUrl?: string
          supabaseAnonKey?: string
        })
      : {}

    if (!body.policyId || !body.action) {
      sendJson(res, 400, { success: false, error: 'Missing required fields: policyId, action' })
      return
    }

    if (!['start_trial', 'promote', 'revert'].includes(body.action)) {
      sendJson(res, 400, { success: false, error: 'Invalid action. Must be: start_trial, promote, or revert' })
      return
    }

    const creds = parseSupabaseCredentialsWithServiceRole({
      supabaseUrl: body.supabaseUrl,
      supabaseAnonKey: body.supabaseAnonKey,
    })
    if (!creds.supabaseUrl || !creds.supabaseKey) {
      sendJson(res, 400, { success: false, error: 'Missing Supabase credentials' })
      return
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseKey)

    // Get current policy
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('*')
      .eq('id', body.policyId)
      .single()

    if (policyError || !policy) {
      sendJson(res, 404, { success: false, error: 'Policy not found' })
      return
    }

    // Determine new status based on action
    let newStatus: 'off' | 'trial' | 'promoted'
    let actionType: string
    if (body.action === 'start_trial') {
      if (policy.status !== 'off') {
        sendJson(res, 400, { success: false, error: 'Can only start trial from Off status' })
        return
      }
      newStatus = 'trial'
      actionType = 'start_trial'
    } else if (body.action === 'promote') {
      if (policy.status !== 'trial') {
        sendJson(res, 400, { success: false, error: 'Can only promote from Trial status' })
        return
      }
      newStatus = 'promoted'
      actionType = 'promote'
    } else {
      // revert
      if (policy.status === 'off') {
        sendJson(res, 400, { success: false, error: 'Policy is already Off' })
        return
      }
      newStatus = 'off'
      actionType = 'revert'
    }

    // Update policy status
    const { data: updatedPolicy, error: updateError } = await supabase
      .from('policies')
      .update({
        status: newStatus,
        last_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.policyId)
      .select()
      .single()

    if (updateError || !updatedPolicy) {
      sendJson(res, 500, { success: false, error: updateError?.message || 'Failed to update policy' })
      return
    }

    // Create audit log entry
    const { error: auditError } = await supabase.from('policy_audit_logs').insert({
      policy_id: body.policyId,
      action: actionType,
      from_status: policy.status,
      to_status: newStatus,
      actor: body.actor || 'system',
    })

    if (auditError) {
      console.error('[api/policies/update-status] Failed to create audit log:', auditError)
      // Don't fail the request if audit log fails, but log it
    }

    sendJson(res, 200, {
      success: true,
      policy: updatedPolicy,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/update-status]', msg, err)
    sendJson(res, 500, { success: false, error: msg })
  }
}

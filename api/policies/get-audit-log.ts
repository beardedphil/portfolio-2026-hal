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
      supabaseUrl?: string
      supabaseAnonKey?: string
      limit?: number
    }

    if (!body.policyId) {
      return Response.json({ success: false, error: 'Missing required field: policyId' }, { status: 400 })
    }

    const creds = parseSupabaseCredentialsWithServiceRole({
      supabaseUrl: body.supabaseUrl,
      supabaseAnonKey: body.supabaseAnonKey,
    })
    if (!creds.supabaseUrl || !creds.supabaseKey) {
      return Response.json({ success: false, error: 'Missing Supabase credentials' }, { status: 400 })
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseKey)

    const limit = body.limit && body.limit > 0 && body.limit <= 100 ? body.limit : 20

    const { data, error } = await supabase
      .from('policy_audit_logs')
      .select('*')
      .eq('policy_id', body.policyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 })
    }

    return Response.json(
      {
        success: true,
        auditLogs: data || [],
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/get-audit-log] POST', msg, err)
    return Response.json({ success: false, error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/get-audit-log] POST', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/policies/get-audit-log] response object missing (received only one argument)')
    throw new Error('Policies get-audit-log: response object missing')
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
          supabaseUrl?: string
          supabaseAnonKey?: string
          limit?: number
        })
      : {}

    if (!body.policyId) {
      sendJson(res, 400, { success: false, error: 'Missing required field: policyId' })
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

    const limit = body.limit && body.limit > 0 && body.limit <= 100 ? body.limit : 20

    const { data, error } = await supabase
      .from('policy_audit_logs')
      .select('*')
      .eq('policy_id', body.policyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      sendJson(res, 500, { success: false, error: error.message })
      return
    }

    sendJson(res, 200, {
      success: true,
      auditLogs: data || [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/policies/get-audit-log]', msg, err)
    sendJson(res, 500, { success: false, error: msg })
  }
}

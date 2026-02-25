import type { IncomingMessage, ServerResponse } from 'http'
import { getSession, encryptSessionTokens } from '../_lib/github/session.js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { createClient } from '@supabase/supabase-js'
import { redactSecrets } from '../_lib/redact-secrets.js'

const AUTH_SECRET_MIN = 32

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

async function revokeGitHubToken(accessToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim()
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()
    
    if (!clientId || !clientSecret) {
      return { success: false, error: 'GitHub OAuth credentials not configured' }
    }

    // GitHub OAuth app token revocation endpoint
    const response = await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    })

    if (response.status === 204 || response.ok) {
      return { success: true }
    }

    const errorText = await response.text()
    return { success: false, error: `GitHub revocation failed: ${response.status} ${errorText}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error during revocation' }
  }
}

async function logAuditEvent(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  actionType: string,
  status: 'succeeded' | 'failed',
  summary: string,
  metadata: Record<string, unknown> = {},
  actor?: string
): Promise<void> {
  try {
    await (supabase as any).from('audit_logs').insert({
      project_id: projectId,
      action_type: actionType,
      status,
      summary,
      metadata,
      actor,
    })
  } catch (err) {
    console.error('[api/providers/disconnect] Failed to log audit event:', err)
    // Don't fail the request if audit logging fails
  }
}

async function handleWebRequest(request: Request): Promise<Response> {
  const secret = process.env.AUTH_SESSION_SECRET?.trim()
  if (!secret || secret.length < AUTH_SECRET_MIN) {
    return Response.json(
      { error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.' },
      { status: 503 }
    )
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } })
  }

  const req = {
    method: 'POST',
    url: request.url,
    headers: { cookie: request.headers.get('cookie') ?? undefined },
  }
  const outHeaders: Record<string, string | string[]> = {}
  const res = {
    statusCode: 200,
    _headers: outHeaders,
    setHeader(this: { _headers: Record<string, string | string[]> }, name: string, value: string | number | string[]) {
      const v = typeof value === 'number' ? String(value) : value
      const k = name.toLowerCase()
      const prev = this._headers[k]
      if (prev === undefined) this._headers[k] = v as string
      else if (Array.isArray(prev)) (prev as string[]).push(...(Array.isArray(v) ? v : [v]))
      else this._headers[k] = [prev as string, ...(Array.isArray(v) ? v : [v])]
    },
    getHeader(this: { _headers: Record<string, string | string[]> }, name: string): string | number | string[] | undefined {
      return this._headers[name.toLowerCase()]
    },
    end() {},
  } as ServerResponse & { _headers: Record<string, string | string[]> }

  try {
    const session = await getSession(req as unknown as IncomingMessage, res as ServerResponse)
    const body = (await request.json()) as { provider?: string; projectId?: string; supabaseUrl?: string; supabaseAnonKey?: string }

    if (!body.provider || !body.projectId) {
      return Response.json({ success: false, error: 'Missing required fields: provider, projectId' }, { status: 400 })
    }

    const provider = String(body.provider).toLowerCase()
    if (provider !== 'github') {
      return Response.json({ success: false, error: `Unsupported provider: ${provider}` }, { status: 400 })
    }

    // Get Supabase client
    const creds = parseSupabaseCredentialsWithServiceRole({
      supabaseUrl: body.supabaseUrl,
      supabaseAnonKey: body.supabaseAnonKey,
    })
    if (!creds.supabaseUrl || !creds.supabaseKey) {
      return Response.json({ success: false, error: 'Missing Supabase credentials' }, { status: 400 })
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseKey)

    // Check if provider is connected
    const github = session.github
    if (!github?.accessToken) {
      await logAuditEvent(
        supabase,
        body.projectId,
        'provider_disconnect',
        'failed',
        `Attempted to disconnect ${provider} provider, but no connection found`,
        { provider },
        session.github?.login ? `user:${session.github.login}` : undefined
      )
      return Response.json({ success: false, error: 'Provider not connected' }, { status: 400 })
    }

    const actor = session.github?.login ? `user:${session.github.login}` : undefined

    // Attempt revocation if supported
    let revokeResult: { success: boolean; error?: string } | null = null
    if (provider === 'github') {
      revokeResult = await revokeGitHubToken(github.accessToken)
      // Redact secrets from metadata before storing
      const revokeMetadata = redactSecrets({
        provider,
        revocation_supported: true,
        revocation_error: revokeResult.error || null,
      }) as Record<string, unknown>
      await logAuditEvent(
        supabase,
        body.projectId,
        'provider_revoke',
        revokeResult.success ? 'succeeded' : 'failed',
        revokeResult.success
          ? `Successfully revoked ${provider} OAuth token`
          : `Failed to revoke ${provider} OAuth token: ${revokeResult.error || 'Unknown error'}`,
        revokeMetadata,
        actor
      )
    }

    // Disconnect provider (clear session)
    session.github = undefined
    await session.save()

    // Log disconnect event
    // Redact secrets from metadata before storing
    const disconnectMetadata = redactSecrets({
      provider,
      revocation_attempted: provider === 'github',
      revocation_succeeded: revokeResult?.success ?? false,
      revocation_error: revokeResult?.error || null,
    }) as Record<string, unknown>
    await logAuditEvent(
      supabase,
      body.projectId,
      'provider_disconnect',
      'succeeded',
      `Disconnected ${provider} provider${revokeResult?.success ? ' and revoked access' : revokeResult ? ' (revocation failed)' : ' (revocation not supported)'}`,
      disconnectMetadata,
      actor
    )

    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    const setCookie = outHeaders['set-cookie']
    if (setCookie) {
      for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
    }

    return Response.json(
      {
        success: true,
        revoked: revokeResult?.success ?? false,
        revocationError: revokeResult?.error || null,
      },
      { headers }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/providers/disconnect] POST', msg, err)
    return Response.json({ success: false, error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/providers/disconnect] POST', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/providers/disconnect] response object missing (received only one argument)')
    throw new Error('Provider disconnect: response object missing')
  }
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Cache-Control', 'no-store')
      res.end('Method Not Allowed')
      return
    }

    const secret = process.env.AUTH_SESSION_SECRET?.trim()
    if (!secret || secret.length < AUTH_SECRET_MIN) {
      sendJson(res, 503, {
        error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.',
      })
      return
    }

    const chunks: Uint8Array[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    type BodyShape = { provider?: string; projectId?: string; supabaseUrl?: string; supabaseAnonKey?: string }
    const body: BodyShape = raw ? (JSON.parse(raw) as BodyShape) : {}

    if (!body.provider || !body.projectId) {
      sendJson(res, 400, { success: false, error: 'Missing required fields: provider, projectId' })
      return
    }

    const provider = String(body.provider).toLowerCase()
    if (provider !== 'github') {
      sendJson(res, 400, { success: false, error: `Unsupported provider: ${provider}` })
      return
    }

    const session = await getSession(req, res)

    const creds = parseSupabaseCredentialsWithServiceRole({
      supabaseUrl: body.supabaseUrl,
      supabaseAnonKey: body.supabaseAnonKey,
    })
    if (!creds.supabaseUrl || !creds.supabaseKey) {
      sendJson(res, 400, { success: false, error: 'Missing Supabase credentials' })
      return
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseKey)

    const github = session.github
    if (!github?.accessToken) {
      await logAuditEvent(
        supabase,
        body.projectId,
        'provider_disconnect',
        'failed',
        `Attempted to disconnect ${provider} provider, but no connection found`,
        { provider },
        session.github?.login ? `user:${session.github.login}` : undefined
      )
      sendJson(res, 400, { success: false, error: 'Provider not connected' })
      return
    }

    const actor = session.github?.login ? `user:${session.github.login}` : undefined

    let revokeResult: { success: boolean; error?: string } | null = null
    if (provider === 'github') {
      revokeResult = await revokeGitHubToken(github.accessToken)
      // Redact secrets from metadata before storing
      const revokeMetadata = redactSecrets({
        provider,
        revocation_supported: true,
        revocation_error: revokeResult.error || null,
      }) as Record<string, unknown>
      await logAuditEvent(
        supabase,
        body.projectId,
        'provider_revoke',
        revokeResult.success ? 'succeeded' : 'failed',
        revokeResult.success
          ? `Successfully revoked ${provider} OAuth token`
          : `Failed to revoke ${provider} OAuth token: ${revokeResult.error || 'Unknown error'}`,
        revokeMetadata,
        actor
      )
    }

    session.github = undefined
    await session.save()

    // Redact secrets from metadata before storing
    const disconnectMetadata = redactSecrets({
      provider,
      revocation_attempted: provider === 'github',
      revocation_succeeded: revokeResult?.success ?? false,
      revocation_error: revokeResult?.error || null,
    }) as Record<string, unknown>
    await logAuditEvent(
      supabase,
      body.projectId,
      'provider_disconnect',
      'succeeded',
      `Disconnected ${provider} provider${revokeResult?.success ? ' and revoked access' : revokeResult ? ' (revocation failed)' : ' (revocation not supported)'}`,
      disconnectMetadata,
      actor
    )

    sendJson(res, 200, {
      success: true,
      revoked: revokeResult?.success ?? false,
      revocationError: revokeResult?.error || null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/providers/disconnect]', msg, err)
    sendJson(res, 500, { success: false, error: msg })
  }
}

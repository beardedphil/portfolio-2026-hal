import type { IncomingMessage, ServerResponse } from 'http'
import crypto from 'crypto'
import { getOrigin } from '../../_lib/github/config.js'
import { getSession } from '../../_lib/github/session.js'

const AUTH_SECRET_MIN = 32

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

/** Detect Web Request (Vercel may pass this instead of Node req/res). */
function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

/** Build Node-like req/res from Web Request for iron-session, then return Web Response. */
async function handleWebRequest(request: Request): Promise<Response> {
  const secret = process.env.AUTH_SESSION_SECRET?.trim()
  if (!secret || secret.length < AUTH_SECRET_MIN) {
    return Response.json(
      { error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.' },
      { status: 503 }
    )
  }
  let origin: string
  try {
    origin = getOrigin(request)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Cannot determine origin.' },
      { status: 503 }
    )
  }
  const clientId = process.env.GITHUB_CLIENT_ID?.trim()
  if (!clientId) {
    return Response.json(
      { error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in Vercel Environment Variables.' },
      { status: 503 }
    )
  }

  const req = {
    method: 'GET',
    url: request.url,
    headers: {
      cookie: request.headers.get('cookie') ?? undefined,
      host: request.headers.get('host') ?? undefined,
      'x-forwarded-host': request.headers.get('x-forwarded-host') ?? undefined,
      'x-forwarded-proto': request.headers.get('x-forwarded-proto') ?? undefined,
    },
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

  const session = await getSession(req as unknown as IncomingMessage, res as ServerResponse)
  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${origin}/api/auth/github/callback`
  session.oauthState = state
  session.oauthRedirectUri = redirectUri
  await session.save()

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'repo read:user')

  const headers = new Headers({ Location: url.toString() })
  const setCookie = outHeaders['set-cookie']
  if (setCookie) {
    for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
  }
  return new Response(null, { status: 302, headers })
}

/** Named export for Vercel Web API (GET(request) => Response). */
export async function GET(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/start] GET', msg, err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    try {
      return await handleWebRequest(req)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[api/auth/github/start]', msg, err)
      return Response.json({ error: msg }, { status: 500 })
    }
  }
  if (!res) {
    console.error('[api/auth/github/start] response object missing (received only one argument)')
    throw new Error('Auth start: response object missing')
  }
  const nodeRes = res
  try {
    if ((req as IncomingMessage).method !== 'GET') {
      nodeRes.statusCode = 405
      nodeRes.end('Method Not Allowed')
      return
    }

    const secret = process.env.AUTH_SESSION_SECRET?.trim()
    if (!secret || secret.length < AUTH_SECRET_MIN) {
      sendJson(nodeRes, 503, {
        error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.',
      })
      return
    }

    let origin: string
    try {
      origin = getOrigin(req as IncomingMessage)
    } catch (e) {
      sendJson(nodeRes, 503, { error: e instanceof Error ? e.message : 'Cannot determine origin.' })
      return
    }

    const redirectUri = `${origin}/api/auth/github/callback`

    const session = await getSession(req as IncomingMessage, nodeRes)
    const state = crypto.randomBytes(16).toString('hex')
    session.oauthState = state
    session.oauthRedirectUri = redirectUri
    await session.save()

    const clientId = process.env.GITHUB_CLIENT_ID?.trim()
    if (!clientId) {
      sendJson(nodeRes, 503, { error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in Vercel Environment Variables.' })
      return
    }

    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('scope', 'repo read:user')

    redirect(nodeRes, url.toString())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/start]', msg, err)
    sendJson(nodeRes, 500, { error: msg })
  }
}


import type { IncomingMessage, ServerResponse } from 'http'
import { getOrigin } from '../../_lib/github/config.js'
import { exchangeCodeForToken } from '../../_lib/github/githubApi.js'
import { getSession, encryptSessionTokens } from '../../_lib/github/session.js'

const AUTH_SECRET_MIN = 32
const CODE_DEDUPE_TTL_MS = 60_000

type ExchangedToken = {
  access_token: string
  token_type: string
  scope: string
}

// Best-effort in-memory de-dupe for parallel callback hits.
// If the same one-time `code` arrives twice in the same runtime instance, we exchange it once
// and reuse the token to set cookies for both responses.
const inflightCodeExchanges = new Map<string, { startedAt: number; promise: Promise<ExchangedToken> }>()

async function exchangeCodeOnce(code: string, redirectUri: string): Promise<ExchangedToken> {
  const now = Date.now()
  const existing = inflightCodeExchanges.get(code)
  if (existing && now - existing.startedAt < CODE_DEDUPE_TTL_MS) {
    return await existing.promise
  }

  const promise = (async () => {
    const token = await exchangeCodeForToken({ code, redirectUri })
    return token as ExchangedToken
  })()

  inflightCodeExchanges.set(code, { startedAt: now, promise })
  try {
    return await promise
  } finally {
    // Keep short-lived entry for TTL window to help late duplicates.
    setTimeout(() => {
      const cur = inflightCodeExchanges.get(code)
      if (cur && cur.promise === promise) inflightCodeExchanges.delete(code)
    }, CODE_DEDUPE_TTL_MS).unref?.()
  }
}

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', location)
  res.end()
}

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

async function handleWebRequest(request: Request): Promise<Response> {
  let originForErrorRedirect: string | null = null
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
    originForErrorRedirect = origin
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Cannot determine origin.' }, { status: 503 })
  }

  const req = {
    method: request.method,
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

  try {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } })
    }

    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    const session = await getSession(req as unknown as IncomingMessage, res as ServerResponse)
    const expected = session.oauthState

    if (session.github?.accessToken) {
      const headers = new Headers({ Location: `${origin}/?github=connected`, 'Cache-Control': 'no-store' })
      const setCookie = outHeaders['set-cookie']
      if (setCookie) {
        for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
      }
      return new Response(null, { status: 302, headers })
    }

    if (!code || !state) {
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      const headers = new Headers({
        Location: `${origin}/?github=error&reason=${encodeURIComponent('Invalid OAuth callback (missing code/state).')}`,
        'Cache-Control': 'no-store',
      })
      const setCookie = outHeaders['set-cookie']
      if (setCookie) {
        for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
      }
      return new Response(null, { status: 302, headers })
    }

    if (!expected || state !== expected) {
      if (session.oauthLastCode === code) {
        const headers = new Headers({
          Location: `${origin}/?github=error&reason=${encodeURIComponent(
            'OAuth callback was already handled. Please retry connect if needed.'
          )}`,
          'Cache-Control': 'no-store',
        })
        const setCookie = outHeaders['set-cookie']
        if (setCookie) {
          for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
        }
        return new Response(null, { status: 302, headers })
      }
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      const headers = new Headers({
        Location: `${origin}/?github=error&reason=${encodeURIComponent(
          'Invalid OAuth callback (mismatched state). Please retry connect.'
        )}`,
        'Cache-Control': 'no-store',
      })
      const setCookie = outHeaders['set-cookie']
      if (setCookie) {
        for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
      }
      return new Response(null, { status: 302, headers })
    }

    const redirectUri = session.oauthRedirectUri || `${origin}/api/auth/github/callback`

    session.oauthState = undefined
    session.oauthRedirectUri = undefined
    session.oauthLastCode = code
    session.oauthLastCodeAt = Date.now()
    await session.save()

    const token = await exchangeCodeOnce(code, redirectUri)

    session.github = {
      accessToken: token.access_token,
      scope: token.scope,
      tokenType: token.token_type,
    }
    // Encrypt tokens before saving
    encryptSessionTokens(session)
    await session.save()

    const headers = new Headers({ Location: `${origin}/?github=connected`, 'Cache-Control': 'no-store' })
    const setCookie = outHeaders['set-cookie']
    if (setCookie) {
      for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
    }
    return new Response(null, { status: 302, headers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/callback] GET', msg, err)
    try {
      const session = await getSession(req as unknown as IncomingMessage, res as ServerResponse)
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      const origin = originForErrorRedirect || getOrigin(request)
      const headers = new Headers({
        Location: `${origin}/?github=error&reason=${encodeURIComponent(msg.slice(0, 200))}`,
        'Cache-Control': 'no-store',
      })
      const setCookie = outHeaders['set-cookie']
      if (setCookie) {
        for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
      }
      return new Response(null, { status: 302, headers })
    } catch {
      return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
  }
}

/** Named export for Vercel Web API (GET(request) => Response). */
export async function GET(request: Request): Promise<Response> {
  return await handleWebRequest(request)
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/auth/github/callback] response object missing (received only one argument)')
    throw new Error('Auth callback: response object missing')
  }

  let originForErrorRedirect: string | null = null
  try {
    if (req.method !== 'GET') {
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

    let origin: string
    try {
      origin = getOrigin(req)
      originForErrorRedirect = origin
    } catch (e) {
      sendJson(res, 503, { error: e instanceof Error ? e.message : 'Cannot determine origin.' })
      return
    }
    const url = new URL(req.url ?? '/', origin)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    const session = await getSession(req, res)
    const expected = session.oauthState

    // If the user somehow hits callback again after already connecting, just bounce back to the app.
    // This prevents a second token-exchange attempt with the same one-time code.
    if (session.github?.accessToken) {
      redirect(res, `${origin}/?github=connected`)
      return
    }

    if (!code || !state) {
      // OAuth provider didn't send expected params (or user navigated here manually).
      // Redirect back to app; clear state so user can retry.
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      redirect(res, `${origin}/?github=error&reason=${encodeURIComponent('Invalid OAuth callback (missing code/state).')}`)
      return
    }

    if (!expected || state !== expected) {
      // Potential replay/double-hit: if we already saw this code recently, just bounce back.
      if (session.oauthLastCode === code) {
        redirect(res, `${origin}/?github=error&reason=${encodeURIComponent('OAuth callback was already handled. Please retry connect if needed.')}`)
        return
      }
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      redirect(res, `${origin}/?github=error&reason=${encodeURIComponent('Invalid OAuth callback (mismatched state). Please retry connect.')}`)
      return
    }

    // IMPORTANT: GitHub requires the redirect_uri used during the token exchange to match
    // the redirect_uri used during the authorization request. Store it at /start and reuse it here.
    const redirectUri = session.oauthRedirectUri || `${origin}/api/auth/github/callback`

    // Make callback single-use to prevent parallel replays from double-exchanging the same code.
    // Clear state before exchanging so a second hit fails fast (and doesn't "consume" the one-time code).
    session.oauthState = undefined
    session.oauthRedirectUri = undefined
    session.oauthLastCode = code
    session.oauthLastCodeAt = Date.now()
    await session.save()

    const token = await exchangeCodeOnce(code, redirectUri)

    session.github = {
      accessToken: token.access_token,
      scope: token.scope,
      tokenType: token.token_type,
    }
    // Encrypt tokens before saving
    encryptSessionTokens(session)
    await session.save()

    redirect(res, `${origin}/?github=connected`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/callback]', msg, err)
    // UX: this endpoint is a browser redirect target, so redirect back to the app with an error marker.
    // Also clear oauth state so the user can retry cleanly.
    try {
      const origin = originForErrorRedirect || getOrigin(req)
      const session = await getSession(req, res)
      session.oauthState = undefined
      session.oauthRedirectUri = undefined
      await session.save()
      redirect(res, `${origin}/?github=error&reason=${encodeURIComponent(msg.slice(0, 200))}`)
      return
    } catch {
      // Fall back to JSON if we can't redirect.
      sendJson(res, 500, { error: msg })
    }
  }
}


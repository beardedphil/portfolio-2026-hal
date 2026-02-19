import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import { getViewer } from '../_lib/github/githubApi.js'

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

async function handleWebRequest(request: Request): Promise<Response> {
  const secret = process.env.AUTH_SESSION_SECRET?.trim()
  if (!secret || secret.length < AUTH_SECRET_MIN) {
    return Response.json(
      { error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.' },
      { status: 503 }
    )
  }
  const req = {
    method: 'GET',
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

  const session = await getSession(req as IncomingMessage, res as ServerResponse)
  const github = session.github
  // If token exists but login is missing, fetch it lazily and persist.
  if (github?.accessToken && (!github.login || typeof github.login !== 'string' || github.login.trim() === '')) {
    try {
      const viewer = await getViewer(github.accessToken)
      session.github = { ...github, login: viewer.login }
      await session.save()
    } catch {
      // Non-fatal; continue returning authenticated=true without login.
    }
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  const setCookie = outHeaders['set-cookie']
  if (setCookie) {
    for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
  }

  return Response.json(
    {
      authenticated: !!session.github?.accessToken,
      login: session.github?.login ?? null,
      scope: session.github?.scope ?? null,
    },
    { headers }
  )
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/me] GET', msg, err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    try {
      return await handleWebRequest(req)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[api/auth/me]', msg, err)
      return Response.json({ error: msg }, { status: 500 })
    }
  }
  if (!res) {
    console.error('[api/auth/me] response object missing (received only one argument)')
    throw new Error('Auth me: response object missing')
  }
  const nodeRes = res
  try {
    const secret = process.env.AUTH_SESSION_SECRET?.trim()
    if (!secret || secret.length < AUTH_SECRET_MIN) {
      sendJson(nodeRes, 503, {
        error: 'Auth not configured. Set AUTH_SESSION_SECRET (32+ characters) in Vercel Environment Variables.',
      })
      return
    }

    const session = await getSession(req as IncomingMessage, nodeRes)
    const github = session.github
    if (github?.accessToken && (!github.login || typeof github.login !== 'string' || github.login.trim() === '')) {
      try {
        const viewer = await getViewer(github.accessToken)
        session.github = { ...github, login: viewer.login }
        await session.save()
      } catch {
        // Non-fatal
      }
    }
    sendJson(nodeRes, 200, {
      authenticated: !!session.github?.accessToken,
      login: session.github?.login ?? null,
      scope: session.github?.scope ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/me]', msg, err)
    sendJson(nodeRes, 500, { error: msg })
  }
}


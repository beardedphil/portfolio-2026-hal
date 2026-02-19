import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'

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
    method: request.method,
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

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } })
  }

  const session = await getSession(req as unknown as IncomingMessage, res as ServerResponse)
  session.destroy()

  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  const setCookie = outHeaders['set-cookie']
  if (setCookie) {
    for (const v of Array.isArray(setCookie) ? setCookie : [setCookie]) headers.append('Set-Cookie', v)
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers })
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/logout] POST', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/auth/logout] response object missing (received only one argument)')
    throw new Error('Auth logout: response object missing')
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
    const session = await getSession(req, res)
    session.destroy()
    sendJson(res, 200, { success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/logout]', msg, err)
    sendJson(res, 500, { error: msg })
  }
}


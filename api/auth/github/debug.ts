import type { IncomingMessage, ServerResponse } from 'http'
import { getOrigin } from '../../_lib/github/config.js'

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function buildDebugPayload(origin: string) {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim() || null
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() || null
  const appOrigin = process.env.APP_ORIGIN?.trim() || null
  return {
    origin,
    callbackUrl: `${origin}/api/auth/github/callback`,
    clientId,
    hasClientSecret: !!clientSecret,
    appOrigin,
    nodeEnv: process.env.NODE_ENV || null,
  }
}

async function handleWebRequest(request: Request): Promise<Response> {
  let origin = ''
  try {
    origin = getOrigin(request)
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Cannot determine origin.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return Response.json(buildDebugPayload(origin), { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/debug] GET', msg, err)
    return Response.json({ error: msg }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) {
    console.error('[api/auth/github/debug] response object missing (received only one argument)')
    throw new Error('Auth debug: response object missing')
  }

  const nodeRes = res
  try {
    if ((req as IncomingMessage).method !== 'GET') {
      nodeRes.statusCode = 405
      nodeRes.setHeader('Cache-Control', 'no-store')
      nodeRes.end('Method Not Allowed')
      return
    }

    let origin = ''
    try {
      origin = getOrigin(req as IncomingMessage)
    } catch (e) {
      sendJson(nodeRes, 503, { error: e instanceof Error ? e.message : 'Cannot determine origin.' })
      return
    }

    sendJson(nodeRes, 200, buildDebugPayload(origin))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/github/debug]', msg, err)
    sendJson(nodeRes, 500, { error: msg })
  }
}


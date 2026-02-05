import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../../server/github/session.ts'

const AUTH_SECRET_MIN = 32

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
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


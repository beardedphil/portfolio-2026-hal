import type { IncomingMessage, ServerResponse } from 'http'
import crypto from 'crypto'
import { getOrigin } from '../../../server/github/config'
import { getSession } from '../../../server/github/session'

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const origin = getOrigin(req)
    const redirectUri = `${origin}/api/auth/github/callback`

    const session = await getSession(req, res)
    const state = crypto.randomBytes(16).toString('hex')
    session.oauthState = state
    await session.save()

    const clientId = process.env.GITHUB_CLIENT_ID?.trim()
    if (!clientId) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in env.' }))
      return
    }

    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    // v1: support private repos + PR write (repo scope)
    url.searchParams.set('scope', 'repo read:user')

    redirect(res, url.toString())
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}


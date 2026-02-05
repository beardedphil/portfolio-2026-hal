import type { IncomingMessage, ServerResponse } from 'http'
import { getOrigin } from '../../../server/github/config'
import { exchangeCodeForToken, getViewer } from '../../../server/github/githubApi'
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
    const url = new URL(req.url ?? '/', origin)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    const session = await getSession(req, res)
    const expected = session.oauthState

    if (!code || !state || !expected || state !== expected) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid OAuth callback (missing or mismatched state).' }))
      return
    }

    const redirectUri = `${origin}/api/auth/github/callback`
    const token = await exchangeCodeForToken({ code, redirectUri })
    const viewer = await getViewer(token.access_token)

    session.oauthState = undefined
    session.github = {
      accessToken: token.access_token,
      scope: token.scope,
      tokenType: token.token_type,
      login: viewer.login,
    }
    await session.save()

    redirect(res, `${origin}/?github=connected`)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}


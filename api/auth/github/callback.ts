import type { IncomingMessage, ServerResponse } from 'http'
import { getOrigin } from '../../_lib/github/config.js'
import { exchangeCodeForToken, getViewer } from '../../_lib/github/githubApi.js'
import { getSession } from '../../_lib/github/session.js'

const AUTH_SECRET_MIN = 32

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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

    const token = await exchangeCodeForToken({ code, redirectUri })
    const viewer = await getViewer(token.access_token)

    session.github = {
      accessToken: token.access_token,
      scope: token.scope,
      tokenType: token.token_type,
      login: viewer.login,
    }
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


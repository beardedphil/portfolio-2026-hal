import type { IncomingMessage, ServerResponse } from 'http'
import { getSession, type Session, decryptAccessToken } from '../_lib/github/session.js'
import { listRepos } from '../_lib/github/githubApi.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    const session: Session = await getSession(req, res)
    const encryptedToken = session.github?.accessToken
    if (!encryptedToken) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Not authenticated with GitHub.' }))
      return
    }

    let token: string
    try {
      token = decryptAccessToken(encryptedToken)
    } catch (err) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Failed to decrypt GitHub token. Check server configuration.' }))
      return
    }

    // Minimal pagination: fetch first page only (sorted by pushed_at)
    const repos = await listRepos(token, 1)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ repos }))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}


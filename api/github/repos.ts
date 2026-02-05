import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../../server/github/session'
import { listRepos } from '../../server/github/githubApi'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    const session = await getSession(req, res)
    const token = session.github?.accessToken
    if (!token) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Not authenticated with GitHub.' }))
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


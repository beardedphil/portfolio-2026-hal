import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../../server/github/session.ts'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const session = await getSession(req, res)
    const github = session.github
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        authenticated: !!github?.accessToken,
        login: github?.login ?? null,
        scope: github?.scope ?? null,
      })
    )
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}


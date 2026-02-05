import type { IncomingMessage } from 'http'

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing ${name} in environment`)
  }
  return v.trim()
}

/** Request-like object: Node IncomingMessage or Web Request (has headers) */
type RequestLike = IncomingMessage | { headers: Headers | Record<string, string | string[] | undefined> }

function getHeader(req: RequestLike, name: string): string | undefined {
  const h = req.headers
  if (!h) return undefined
  if (typeof (h as Headers).get === 'function') {
    const v = (h as Headers).get(name) ?? (h as Headers).get(name.toLowerCase())
    return v ?? undefined
  }
  const lower = name.toLowerCase()
  const v = (h as Record<string, string | string[] | undefined>)[name] ?? (h as Record<string, string | string[] | undefined>)[lower]
  return Array.isArray(v) ? v[0] : v ?? undefined
}

export function getOrigin(req: RequestLike): string {
  const explicit = process.env.APP_ORIGIN
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '')

  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host')
  const proto = getHeader(req, 'x-forwarded-proto') || 'http'
  if (!host) throw new Error('Cannot determine origin. Set APP_ORIGIN in Vercel (e.g. https://your-app.vercel.app).')
  return `${proto}://${host}`.replace(/\/+$/, '')
}


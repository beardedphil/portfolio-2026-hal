import type { IncomingMessage } from 'http'

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing ${name} in environment`)
  }
  return v.trim()
}

export function getOrigin(req: IncomingMessage): string {
  const explicit = process.env.APP_ORIGIN
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '')

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'http'
  if (!host) throw new Error('Cannot determine request origin (missing Host header)')
  return `${proto}://${host}`.replace(/\/+$/, '')
}


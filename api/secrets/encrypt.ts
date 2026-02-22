import type { IncomingMessage, ServerResponse } from 'http'
import { encryptSecret } from '../_lib/encryption.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * POST /api/secrets/encrypt
 * 
 * Encrypt a secret on the server side.
 * 
 * Body: { plaintext: string }
 * Response: { encrypted: string }
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const body = (await readJsonBody(req)) as { plaintext?: string }
    const plaintext = typeof body.plaintext === 'string' ? body.plaintext : undefined

    if (!plaintext) {
      sendJson(res, 400, { error: 'plaintext is required' })
      return
    }

    try {
      const encrypted = encryptSecret(plaintext)
      sendJson(res, 200, { encrypted })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encryption failed'
      // Don't leak secrets in error messages
      if (msg.includes('HAL_ENCRYPTION_KEY')) {
        sendJson(res, 503, { error: 'Encryption is not configured. Contact administrator.' })
      } else {
        sendJson(res, 500, { error: 'Encryption failed' })
      }
      console.error('[api/secrets/encrypt]', msg)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/secrets/encrypt]', msg, err)
    sendJson(res, 500, { error: 'Internal server error' })
  }
}

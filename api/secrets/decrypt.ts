import type { IncomingMessage, ServerResponse } from 'http'
import { decryptSecret } from '../_lib/encryption.js'

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
 * POST /api/secrets/decrypt
 * 
 * Decrypt a secret on the server side.
 * 
 * Body: { encrypted: string }
 * Response: { plaintext: string }
 * 
 * Note: This endpoint should only be used server-side or in trusted contexts.
 * For client-side use, consider if decryption should be exposed at all.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const body = (await readJsonBody(req)) as { encrypted?: string }
    const encrypted = typeof body.encrypted === 'string' ? body.encrypted : undefined

    if (!encrypted) {
      sendJson(res, 400, { error: 'encrypted is required' })
      return
    }

    try {
      const plaintext = decryptSecret(encrypted)
      sendJson(res, 200, { plaintext })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed'
      // Don't leak secrets in error messages
      if (msg.includes('HAL_ENCRYPTION_KEY')) {
        sendJson(res, 503, { error: 'Decryption is not configured. Contact administrator.' })
      } else if (msg.includes('Decryption failed')) {
        sendJson(res, 400, { error: 'Invalid encrypted data' })
      } else {
        sendJson(res, 500, { error: 'Decryption failed' })
      }
      console.error('[api/secrets/decrypt]', msg)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/secrets/decrypt]', msg, err)
    sendJson(res, 500, { error: 'Internal server error' })
  }
}

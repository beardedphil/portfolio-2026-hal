import type { IncomingMessage, ServerResponse } from 'http'

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * GET /api/secrets/status
 * 
 * Check if encryption is configured and working.
 * 
 * Response: { configured: boolean, error?: string }
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const keyEnv = process.env.HAL_ENCRYPTION_KEY?.trim()
    if (!keyEnv) {
      sendJson(res, 200, { 
        configured: false,
        error: 'HAL_ENCRYPTION_KEY is not set in server environment variables.'
      })
      return
    }

    // Try to parse the key to verify it's valid
    try {
      let key: Buffer
      try {
        key = Buffer.from(keyEnv, 'base64')
        if (key.length !== 32) {
          key = Buffer.from(keyEnv, 'hex')
          if (key.length !== 32) {
            sendJson(res, 200, { 
              configured: false,
              error: 'HAL_ENCRYPTION_KEY must be exactly 32 bytes (base64 or hex encoded).'
            })
            return
          }
        }
      } catch {
        sendJson(res, 200, { 
          configured: false,
          error: 'HAL_ENCRYPTION_KEY is invalid (not base64 or hex).'
        })
        return
      }

      // Test encryption/decryption with a dummy value
      const { encryptSecret, decryptSecret } = await import('../_lib/encryption.js')
      const testValue = 'test-encryption-check'
      const encrypted = encryptSecret(testValue)
      const decrypted = decryptSecret(encrypted)
      
      if (decrypted !== testValue) {
        sendJson(res, 200, { 
          configured: false,
          error: 'Encryption test failed (decrypted value does not match).'
        })
        return
      }

      sendJson(res, 200, { configured: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encryption test failed'
      sendJson(res, 200, { 
        configured: false,
        error: msg
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/secrets/status]', msg, err)
    sendJson(res, 500, { error: 'Internal server error' })
  }
}

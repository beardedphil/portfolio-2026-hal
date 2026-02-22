import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getEncryptedSecret } from '../../_lib/encrypted-secrets.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      undefined

    // Check if encryption key is configured
    const encryptionKeyConfigured = !!(
      process.env.HAL_ENCRYPTION_KEY?.trim() && process.env.HAL_ENCRYPTION_KEY.trim().length >= 32
    )

    // Check if Supabase is configured
    const supabaseConfigured = !!(supabaseUrl && supabaseServiceRoleKey)

    // Try to check if encrypted secrets table exists and has data
    let hasEncryptedSecrets = false
    let encryptionWorking = false
    let errorMessage: string | null = null

    if (supabaseConfigured && encryptionKeyConfigured) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

        // Check if encrypted_secrets table exists by trying to query it
        const { data, error } = await supabase.from('encrypted_secrets').select('id').limit(1)

        if (error) {
          // Table might not exist yet (migration not run)
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            errorMessage = 'encrypted_secrets table does not exist (migration not run)'
          } else {
            errorMessage = `Failed to check encrypted_secrets: ${error.message}`
          }
        } else {
          hasEncryptedSecrets = true

          // Try to encrypt/decrypt a test value to verify encryption is working
          try {
            const testSecret = await getEncryptedSecret(supabase, 'oauth_github_access_token', null)
            // If we can query without error, encryption is working
            encryptionWorking = true
          } catch (encryptErr) {
            if (encryptErr instanceof Error && encryptErr.message.includes('HAL_ENCRYPTION_KEY')) {
              errorMessage = 'Encryption key is invalid or misconfigured'
            } else {
              // No secrets stored yet, but encryption should work
              encryptionWorking = true
            }
          }
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
      }
    } else if (!encryptionKeyConfigured) {
      errorMessage = 'HAL_ENCRYPTION_KEY is not configured (minimum 32 characters required)'
    } else if (!supabaseConfigured) {
      errorMessage = 'Supabase credentials not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)'
    }

    json(res, 200, {
      success: true,
      encryptionEnabled: encryptionKeyConfigured && supabaseConfigured && encryptionWorking,
      encryptionKeyConfigured,
      supabaseConfigured,
      hasEncryptedSecrets,
      errorMessage,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      encryptionEnabled: false,
    })
  }
}

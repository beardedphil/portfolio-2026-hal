import type { IncomingMessage, ServerResponse } from 'http'
import * as IronSession from 'iron-session'
import type { SessionOptions } from 'iron-session'
import { requireEnv } from './config.js'
import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

export type GithubSession = {
  accessToken: string // May be encrypted (starts with base64 prefix) or plaintext (for migration)
  scope?: string
  tokenType?: string
  login?: string
}

export type HalSessionData = {
  oauthState?: string
  /** Exact redirectUri used during OAuth start; must match during token exchange. */
  oauthRedirectUri?: string
  /** Most recent OAuth code observed (for de-duping callback replays). */
  oauthLastCode?: string
  /** Epoch ms when oauthLastCode was stored. */
  oauthLastCodeAt?: number
  github?: GithubSession
}

declare module 'iron-session' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IronSessionData extends HalSessionData {}
}

/** Session type for use in API handlers (includes github when authenticated). */
export type Session = IronSession.IronSession<HalSessionData>

function sessionOptions(): SessionOptions {
  return {
    cookieName: 'hal_session',
    password: requireEnv('AUTH_SESSION_SECRET'),
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax', // 'lax' allows cookies on same-site POST requests (0119)
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }
}

export async function getSession(
  req: IncomingMessage,
  res: ServerResponse
): Promise<Session> {
  return IronSession.getIronSession(req, res, sessionOptions())
}

/**
 * Encrypt an OAuth access token before storing in session.
 * If encryption fails (e.g., HAL_ENCRYPTION_KEY not set), throws an error.
 */
export function encryptAccessToken(plaintextToken: string): string {
  try {
    return encryptSecret(plaintextToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Encryption failed'
    if (msg.includes('HAL_ENCRYPTION_KEY')) {
      throw new Error('Secrets encryption is not configured. Set HAL_ENCRYPTION_KEY in server environment variables.')
    }
    throw err
  }
}

/**
 * Decrypt an OAuth access token from session.
 * If the token is not encrypted (plaintext, for migration), returns it as-is.
 * If decryption fails, throws an error.
 */
export function decryptAccessToken(encryptedToken: string): string {
  // Check if it's encrypted (heuristic: base64 with minimum length)
  if (!isEncrypted(encryptedToken)) {
    // Plaintext token (for migration compatibility)
    return encryptedToken
  }

  try {
    return decryptSecret(encryptedToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Decryption failed'
    if (msg.includes('HAL_ENCRYPTION_KEY')) {
      throw new Error('Secrets decryption is not configured. Set HAL_ENCRYPTION_KEY in server environment variables.')
    }
    throw err
  }
}

/**
 * Get the decrypted GitHub access token from session.
 * Returns undefined if no token is present or if decryption fails.
 */
export async function getDecryptedGithubToken(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | undefined> {
  try {
    const session = await getSession(req, res)
    const encryptedToken = session.github?.accessToken
    if (!encryptedToken) return undefined
    return decryptAccessToken(encryptedToken)
  } catch (err) {
    console.error('[getDecryptedGithubToken]', err instanceof Error ? err.message : String(err))
    return undefined
  }
}

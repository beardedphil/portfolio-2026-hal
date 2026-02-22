import type { IncomingMessage, ServerResponse } from 'http'
import * as IronSession from 'iron-session'
import type { SessionOptions } from 'iron-session'
import { requireEnv } from './config.js'
import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

export type GithubSession = {
  accessToken: string
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
  const session = await IronSession.getIronSession(req, res, sessionOptions())
  
  // Decrypt OAuth tokens if they're encrypted (for migration compatibility)
  if (session.github?.accessToken) {
    if (isEncrypted(session.github.accessToken)) {
      try {
        session.github = {
          ...session.github,
          accessToken: decryptSecret(session.github.accessToken),
        }
      } catch (err) {
        // If decryption fails, clear the session to force re-auth
        console.error('[session] Failed to decrypt OAuth token:', err instanceof Error ? err.message : String(err))
        session.github = undefined
        await session.save()
      }
    }
  }
  
  return session
}

/**
 * Encrypts OAuth tokens before storing in session.
 * This adds an extra layer of encryption beyond iron-session's cookie encryption.
 */
export function encryptSessionTokens(session: Session): void {
  if (session.github?.accessToken && !isEncrypted(session.github.accessToken)) {
    try {
      session.github = {
        ...session.github,
        accessToken: encryptSecret(session.github.accessToken),
      }
    } catch (err) {
      // If encryption fails (e.g., HAL_ENCRYPTION_KEY missing), don't store plaintext
      // Clear the session to force re-auth with proper encryption
      console.error('[session] Failed to encrypt OAuth token:', err instanceof Error ? err.message : String(err))
      throw new Error('Secret encryption failed. Set HAL_ENCRYPTION_KEY environment variable.')
    }
  }
}

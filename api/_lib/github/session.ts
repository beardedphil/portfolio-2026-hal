import type { IncomingMessage, ServerResponse } from 'http'
import * as IronSession from 'iron-session'
import type { SessionOptions } from 'iron-session'
import { requireEnv } from './config.js'

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
  return IronSession.getIronSession(req, res, sessionOptions())
}

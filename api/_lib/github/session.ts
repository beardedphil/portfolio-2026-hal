import type { IncomingMessage, ServerResponse } from 'http'
import * as IronSession from 'iron-session'
import type { IronSessionOptions } from 'iron-session'
import { requireEnv } from './config.js'

export type GithubSession = {
  accessToken: string
  scope?: string
  tokenType?: string
  login?: string
}

export type HalSessionData = {
  oauthState?: string
  github?: GithubSession
}

declare module 'iron-session' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IronSessionData extends HalSessionData {}
}

function sessionOptions(): IronSessionOptions {
  return {
    cookieName: 'hal_session',
    password: requireEnv('AUTH_SESSION_SECRET'),
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }
}

export async function getSession(req: IncomingMessage, res: ServerResponse) {
  return IronSession.getIronSession(req, res, sessionOptions())
}

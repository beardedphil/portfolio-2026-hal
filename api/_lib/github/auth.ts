import { requireEnv } from './config.js'

export type GithubTokenResponse = {
  access_token: string
  token_type: string
  scope: string
}

export async function exchangeCodeForToken(args: {
  code: string
  redirectUri: string
}): Promise<GithubTokenResponse> {
  const clientId = requireEnv('GITHUB_CLIENT_ID')
  const clientSecret = requireEnv('GITHUB_CLIENT_SECRET')

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: args.code,
      redirect_uri: args.redirectUri,
    }),
  })

  const json = (await res.json().catch(() => null)) as
    | (GithubTokenResponse & { error?: string; error_description?: string })
    | null

  if (!res.ok || !json || !('access_token' in json)) {
    const msg =
      json?.error && json?.error_description
        ? `${json.error}: ${json.error_description}`
        : json?.error_description || json?.error || `GitHub token exchange failed (${res.status})`
    throw new Error(msg)
  }
  return json
}

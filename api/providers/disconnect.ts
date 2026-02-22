import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from '../bootstrap/_shared.js'
import { redactSecrets } from '../_lib/redact-secrets.js'

/**
 * Attempts to revoke access for a provider.
 * Returns { success: boolean, error?: string }
 */
async function revokeProviderAccess(
  providerType: string,
  credentials: unknown
): Promise<{ success: boolean; error?: string }> {
  // Cursor API: Revoke agent access (if applicable)
  if (providerType === 'cursor') {
    // Cursor API doesn't have a direct revocation endpoint for agents
    // The agent is tied to the API key, so revoking would require revoking the entire API key
    // For now, we'll mark it as "revocation not supported" rather than failing
    return { success: false, error: 'Revocation not supported for Cursor API (requires API key revocation)' }
  }

  // OpenAI API: Revoke API key (if we stored the key)
  if (providerType === 'openai') {
    // OpenAI doesn't have a direct API to revoke keys
    // The key would need to be revoked in the OpenAI dashboard
    return { success: false, error: 'Revocation not supported for OpenAI API (requires manual key revocation in dashboard)' }
  }

  // GitHub: Revoke OAuth token
  if (providerType === 'github') {
    try {
      const creds = credentials as { access_token?: string; client_id?: string; client_secret?: string } | null
      if (!creds?.access_token) {
        return { success: false, error: 'No access token found for GitHub provider' }
      }

      // GitHub OAuth token revocation requires client_id and client_secret
      // These are typically stored server-side for security
      const clientId = creds.client_id || process.env.GITHUB_CLIENT_ID
      const clientSecret = creds.client_secret || process.env.GITHUB_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        return {
          success: false,
          error: 'GitHub client credentials not available. Token revocation requires client_id and client_secret.',
        }
      }

      // Revoke GitHub OAuth token using Basic auth with client credentials
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const revokeRes = await fetch(`https://api.github.com/applications/${clientId}/token`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ access_token: creds.access_token }),
      })

      if (revokeRes.ok || revokeRes.status === 404) {
        // 404 means token was already revoked or doesn't exist
        return { success: true }
      }

      const errorText = await revokeRes.text()
      return { success: false, error: `GitHub revocation failed: ${revokeRes.status} ${errorText}` }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Unknown provider type
  return { success: false, error: `Revocation not supported for provider type: ${providerType}` }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
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
      projectId: string
      providerId: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : undefined

    if (!projectId || !providerId) {
      json(res, 400, {
        success: false,
        error: 'projectId and providerId are required',
      })
      return
    }

    const { supabaseUrl, supabaseKey } = parseBootstrapCredentials(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch the provider
    const { data: provider, error: fetchError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .eq('project_id', projectId)
      .single()

    if (fetchError || !provider) {
      json(res, 404, {
        success: false,
        error: 'Provider not found',
      })
      return
    }

    if (provider.status === 'disconnected') {
      json(res, 400, {
        success: false,
        error: 'Provider is already disconnected',
      })
      return
    }

    // Attempt revocation if supported
    let revocationResult: { success: boolean; error?: string } | null = null
    if (provider.credentials) {
      revocationResult = await revokeProviderAccess(provider.provider_type, provider.credentials)
    } else {
      revocationResult = { success: false, error: 'No credentials stored for revocation' }
    }

    // Update provider status to disconnected
    const { error: updateError } = await supabase
      .from('providers')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
      })
      .eq('id', providerId)

    if (updateError) {
      json(res, 500, {
        success: false,
        error: `Failed to disconnect provider: ${updateError.message}`,
      })
      return
    }

    // Log disconnect action to audit log
    const disconnectDetails = redactSecrets({
      provider_type: provider.provider_type,
      provider_name: provider.provider_name,
      revocation_attempted: revocationResult !== null,
      revocation_success: revocationResult?.success ?? false,
      revocation_error: revocationResult?.error,
    })

    const { error: auditError } = await supabase.from('audit_log').insert({
      project_id: projectId,
      action_type: 'provider_disconnect',
      status: 'succeeded',
      summary: `Disconnected ${provider.provider_name} provider`,
      details: disconnectDetails,
    })

    if (auditError) {
      // Log error but don't fail the disconnect
      console.error('Failed to log disconnect to audit log:', auditError)
    }

    // If revocation was attempted, log it separately
    if (revocationResult) {
      const revokeDetails = redactSecrets({
        provider_type: provider.provider_type,
        provider_name: provider.provider_name,
        success: revocationResult.success,
        error: revocationResult.error,
      })

      await supabase.from('audit_log').insert({
        project_id: projectId,
        action_type: 'provider_revoke',
        status: revocationResult.success ? 'succeeded' : 'failed',
        summary: revocationResult.success
          ? `Successfully revoked access for ${provider.provider_name}`
          : `Failed to revoke access for ${provider.provider_name}: ${revocationResult.error}`,
        details: revokeDetails,
        error_message: revocationResult.success ? null : revocationResult.error,
      })
    }

    json(res, 200, {
      success: true,
      provider: {
        ...provider,
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
      },
      revocation: revocationResult,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

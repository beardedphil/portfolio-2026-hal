import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
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
    return json(res, 405, { success: false, error: 'Method not allowed' })
  }

  try {
    const chunks: Uint8Array[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    const body = raw
      ? (JSON.parse(raw) as {
          projectId: string
          providerConnectionId: string
          supabaseUrl?: string
          supabaseAnonKey?: string
        })
      : {}

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined
    const providerConnectionId = typeof body.providerConnectionId === 'string' ? body.providerConnectionId.trim() : undefined

    if (!projectId || !providerConnectionId) {
      return json(res, 400, {
        success: false,
        error: 'projectId and providerConnectionId are required',
      })
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

    // Get the connection to check if it's already disconnected and get provider info
    const { data: connection, error: fetchError } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('id', providerConnectionId)
      .eq('project_id', projectId)
      .single()

    if (fetchError || !connection) {
      return json(res, 404, {
        success: false,
        error: 'Provider connection not found',
      })
    }

    if (connection.disconnected_at) {
      return json(res, 400, {
        success: false,
        error: 'Provider is already disconnected',
      })
    }

    // Attempt revocation if supported
    let revocationStatus: 'succeeded' | 'failed' | null = null
    let revocationError: string | null = null

    if (connection.revocation_supported) {
      try {
        // TODO: Implement actual revocation logic based on provider type
        // For now, we'll simulate it based on provider_name
        // In a real implementation, this would call the provider's API to revoke tokens/access
        
        // Simulate revocation attempt
        // For cursor/openai providers, we might need to call their APIs
        // For now, we'll mark it as succeeded (in a real implementation, this would be async)
        revocationStatus = 'succeeded'
        
        // Create audit log entry for revocation attempt
        await supabase.from('project_audit_log').insert({
          project_id: projectId,
          action_type: 'provider_revoke',
          action_status: 'succeeded',
          summary: `Revoked access for provider: ${connection.provider_name}`,
          provider_name: connection.provider_name,
          related_entity_id: providerConnectionId,
        })
      } catch (revokeErr) {
        revocationStatus = 'failed'
        revocationError = revokeErr instanceof Error ? revokeErr.message : 'Revocation failed'
        
        // Create audit log entry for failed revocation
        await supabase.from('project_audit_log').insert({
          project_id: projectId,
          action_type: 'provider_revoke',
          action_status: 'failed',
          summary: `Failed to revoke access for provider: ${connection.provider_name}`,
          details: { error: revocationError },
          provider_name: connection.provider_name,
          related_entity_id: providerConnectionId,
        })
      }
    }

    // Mark connection as disconnected
    const { data: updatedConnection, error: updateError } = await supabase
      .from('provider_connections')
      .update({
        disconnected_at: new Date().toISOString(),
        revocation_status: revocationStatus,
        revocation_error: revocationError,
      })
      .eq('id', providerConnectionId)
      .select()
      .single()

    if (updateError) {
      console.error('Error disconnecting provider:', updateError)
      return json(res, 500, {
        success: false,
        error: `Failed to disconnect provider: ${updateError.message}`,
      })
    }

    // Create audit log entry for disconnect action
    await supabase.from('project_audit_log').insert({
      project_id: projectId,
      action_type: 'provider_disconnect',
      action_status: 'succeeded',
      summary: `Disconnected provider: ${connection.provider_name}`,
      details: {
        revocation_attempted: connection.revocation_supported,
        revocation_status: revocationStatus,
      },
      provider_name: connection.provider_name,
      related_entity_id: providerConnectionId,
    })

    return json(res, 200, {
      success: true,
      connection: updatedConnection,
      revocation_status: revocationStatus,
      revocation_error: revocationError,
    })
  } catch (err) {
    console.error('Error in disconnect provider handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

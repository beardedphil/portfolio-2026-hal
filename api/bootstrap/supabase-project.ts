/**
 * API endpoint to fetch Supabase project metadata for a given project_id.
 * Returns project info with masked keys (never plaintext secrets).
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from './_shared.js'
import { isEncrypted } from '../_lib/encryption.js'

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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined

    if (!projectId) {
      json(res, 400, {
        success: false,
        error: 'projectId is required',
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

    // Fetch Supabase project metadata
    const { data: project, error: fetchError } = await supabase
      .from('supabase_projects')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    if (fetchError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch Supabase project: ${fetchError.message}`,
      })
      return
    }

    if (!project) {
      json(res, 200, {
        success: true,
        project: null,
      })
      return
    }

    // Return project info with masked keys (never plaintext)
    // Verify keys are encrypted before masking
    const anonKeyEncrypted = isEncrypted(project.encrypted_anon_key)
    const serviceRoleKeyEncrypted = isEncrypted(project.encrypted_service_role_key)

    json(res, 200, {
      success: true,
      project: {
        id: project.id,
        project_id: project.project_id,
        repo_full_name: project.repo_full_name,
        supabase_project_ref: project.supabase_project_ref,
        supabase_project_id: project.supabase_project_id,
        supabase_api_url: project.supabase_api_url,
        status: project.status,
        created_at: project.created_at,
        updated_at: project.updated_at,
        created_by: project.created_by,
        error_summary: project.error_summary,
        error_details: project.error_details,
        // Keys are always masked - never return plaintext
        anon_key_masked: anonKeyEncrypted ? '•••••••••••••••• (Stored securely)' : 'Not configured',
        service_role_key_masked: serviceRoleKeyEncrypted ? '•••••••••••••••• (Stored securely)' : 'Not configured',
        database_password_masked: project.encrypted_database_password
          ? (isEncrypted(project.encrypted_database_password) ? '•••••••••••••••• (Stored securely)' : 'Not configured')
          : null,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

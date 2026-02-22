import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from './_shared.js'
import { isEncrypted } from '../_lib/encryption.js'

/**
 * Gets Supabase project details for a project.
 * Returns project metadata (ref, URL, name) but never returns plaintext secrets.
 */
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
      projectId?: string
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

    // Fetch project metadata
    const { data: project, error } = await supabase
      .from('supabase_projects')
      .select('project_ref, project_name, api_url, organization_id, region, status, created_at, updated_at')
      .eq('status', 'created')
      .maybeSingle()

    if (error) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch project: ${error.message}`,
      })
      return
    }

    if (!project) {
      json(res, 200, {
        success: true,
        project: null,
        message: 'No Supabase project configured',
      })
      return
    }

    // Verify that keys are encrypted (security check)
    const { data: keyCheck } = await supabase
      .from('supabase_projects')
      .select('anon_key_encrypted, service_role_key_encrypted')
      .eq('project_ref', project.project_ref)
      .single()

    const keysStored = keyCheck && 
      isEncrypted(keyCheck.anon_key_encrypted) && 
      isEncrypted(keyCheck.service_role_key_encrypted)

    json(res, 200, {
      success: true,
      project: {
        ...project,
        keysStored,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

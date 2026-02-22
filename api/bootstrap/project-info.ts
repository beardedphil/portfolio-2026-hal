import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from './_shared.js'

/**
 * Returns Supabase project information (without sensitive credentials) for a given project_id.
 * This endpoint is safe to call from the frontend as it never returns encrypted secrets.
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

    // Fetch project info (without decrypting secrets)
    const { data: project, error: fetchError } = await supabase
      .from('supabase_projects')
      .select('id, project_id, supabase_project_ref, supabase_project_name, supabase_api_url, status, created_at, updated_at')
      .eq('project_id', projectId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        // No project found
        json(res, 200, {
          success: true,
          project: null,
          message: 'No Supabase project configured for this project',
        })
        return
      }

      json(res, 500, {
        success: false,
        error: `Failed to fetch project info: ${fetchError.message}`,
      })
      return
    }

    if (!project) {
      json(res, 200, {
        success: true,
        project: null,
        message: 'No Supabase project configured for this project',
      })
      return
    }

    // Return project info without any secrets
    json(res, 200, {
      success: true,
      project: {
        id: project.id,
        project_id: project.project_id,
        supabase_project_ref: project.supabase_project_ref,
        supabase_project_name: project.supabase_project_name,
        supabase_api_url: project.supabase_api_url,
        status: project.status,
        created_at: project.created_at,
        updated_at: project.updated_at,
        // Explicitly do NOT include any encrypted_* fields
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

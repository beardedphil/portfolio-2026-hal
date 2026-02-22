import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from './_shared.js'

/**
 * Fetches Supabase project metadata for a given repository.
 * Returns project info without encrypted keys (keys are masked in UI).
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

    // Fetch project metadata (excluding encrypted keys)
    const { data: project, error } = await supabase
      .from('supabase_projects')
      .select('repo_full_name, project_ref, project_url, status, created_at, updated_at')
      .eq('repo_full_name', projectId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No project found - that's okay, return null
        json(res, 200, {
          success: true,
          project: null,
        })
        return
      }

      json(res, 500, {
        success: false,
        error: `Failed to fetch project metadata: ${error.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      project: project || null,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

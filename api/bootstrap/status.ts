import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials } from './_shared.js'

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
      runId?: string
      projectId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const runId = typeof body.runId === 'string' ? body.runId.trim() : undefined
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined

    if (!runId && !projectId) {
      json(res, 400, {
        success: false,
        error: 'runId or projectId is required',
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

    let query = supabase.from('bootstrap_runs').select('*')

    if (runId) {
      query = query.eq('id', runId)
    } else if (projectId) {
      query = query.eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
    }

    const { data: runs, error } = await query

    if (error) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch bootstrap run: ${error.message}`,
      })
      return
    }

    if (!runs || runs.length === 0) {
      json(res, 404, {
        success: false,
        error: 'Bootstrap run not found',
      })
      return
    }

    const run = runs[0]

    json(res, 200, {
      success: true,
      run,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

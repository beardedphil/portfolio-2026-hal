import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentials } from './_shared.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: allow cross-origin callers (agents/scripts).
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
    const body = (await readJsonBody(req)) as { supabaseUrl?: string; supabaseAnonKey?: string }
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error:
          'Supabase credentials required (set SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: rows, error } = await supabase.from('tickets').select('repo_full_name')

    if (error) {
      json(res, 200, { success: false, error: `Failed to fetch repos: ${error.message}` })
      return
    }

    const repoSet = new Set<string>()
    for (const r of rows ?? []) {
      const repo = (r as any).repo_full_name
      if (typeof repo === 'string' && repo.trim() !== '') repoSet.add(repo.trim())
    }

    const repos = Array.from(repoSet)
      .sort()
      .map((repo_full_name) => ({ repo_full_name }))

    json(res, 200, { success: true, repos, count: repos.length })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}


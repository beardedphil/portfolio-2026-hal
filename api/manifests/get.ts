/**
 * API endpoint to get Integration Manifest v0 for a repo.
 * Returns the latest version by default, or a specific version by manifest_id.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { success: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      manifestId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const manifestId = typeof body.manifestId === 'string' ? body.manifestId.trim() : undefined

    if (!repoFullName && !manifestId) {
      json(res, 400, {
        success: false,
        error: 'repoFullName or manifestId is required.',
      })
      return
    }

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    let query = supabase.from('integration_manifests').select('*')

    if (manifestId) {
      // Get specific version
      query = query.eq('manifest_id', manifestId)
    } else if (repoFullName) {
      // Get latest version for repo
      query = query.eq('repo_full_name', repoFullName).order('created_at', { ascending: false }).limit(1)
    }

    const { data: manifests, error } = await query

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch manifest: ${error.message}`,
      })
      return
    }

    if (!manifests || manifests.length === 0) {
      json(res, 200, {
        success: false,
        error: 'Manifest not found.',
      })
      return
    }

    const manifest = manifests[0]

    json(res, 200, {
      success: true,
      manifest: {
        manifest_id: manifest.manifest_id,
        repo_full_name: manifest.repo_full_name,
        default_branch: manifest.default_branch,
        schema_version: manifest.schema_version,
        env_identifiers: manifest.env_identifiers,
        goal: manifest.goal,
        stack: manifest.stack,
        constraints: manifest.constraints,
        conventions: manifest.conventions,
        content_hash: manifest.content_hash,
        previous_version_id: manifest.previous_version_id,
        created_at: manifest.created_at,
        created_by: manifest.created_by,
      },
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

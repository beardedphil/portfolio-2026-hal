/**
 * API endpoint to get an Integration Manifest for a repository.
 * Supports fetching by version_id or "latest".
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
      versionId?: string | 'latest'
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const versionId = body.versionId

    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
      return
    }

    if (versionId === undefined) {
      json(res, 400, {
        success: false,
        error: 'versionId is required (provide a version_id string or "latest").',
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

    let manifest: any = null
    let error: any = null

    if (versionId === 'latest') {
      // Use the database function to get latest manifest
      const { data, error: funcError } = await supabase.rpc('get_latest_integration_manifest', {
        p_repo_full_name: repoFullName,
      })

      if (funcError) {
        error = funcError
      } else if (data && data.length > 0) {
        manifest = data[0]
      } else {
        json(res, 200, {
          success: false,
          error: 'No manifest found for this repository.',
        })
        return
      }
    } else {
      // Fetch specific version
      const { data, error: fetchError } = await supabase
        .from('hal_integration_manifests')
        .select('*')
        .eq('repo_full_name', repoFullName)
        .eq('version_id', versionId)
        .maybeSingle()

      if (fetchError) {
        error = fetchError
      } else if (!data) {
        json(res, 200, {
          success: false,
          error: `Manifest version ${versionId} not found for this repository.`,
        })
        return
      } else {
        manifest = data
      }
    }

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch manifest: ${error.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      manifest,
      repo_full_name: repoFullName,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

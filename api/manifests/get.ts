/**
 * API endpoint for getting Integration Manifest v0
 * 
 * POST /api/manifests/get
 * 
 * Body: {
 *   repoFullName: string
 *   versionNumber?: number (optional, defaults to latest)
 *   supabaseUrl?: string
 *   supabaseAnonKey?: string
 * }
 * 
 * Returns: {
 *   success: boolean
 *   manifest?: {
 *     manifestId: string
 *     versionNumber: number
 *     contentHash: string
 *     manifestContent: ManifestContent
 *     previousVersionId?: string
 *     createdAt: string
 *   }
 *   error?: string
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: allow cross-origin callers
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
      versionNumber?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error:
          'Supabase credentials required (set SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    if (!body.repoFullName || typeof body.repoFullName !== 'string') {
      json(res, 400, { success: false, error: 'repoFullName is required' })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Build query
    let query = supabase
      .from('integration_manifests')
      .select('manifest_id, version_number, content_hash, manifest_content, previous_version_id, created_at')
      .eq('repo_full_name', body.repoFullName)

    // If versionNumber is specified, get that version; otherwise get latest
    if (typeof body.versionNumber === 'number') {
      query = query.eq('version_number', body.versionNumber)
    } else {
      query = query.order('version_number', { ascending: false }).limit(1)
    }

    const { data: manifests, error } = await query

    if (error) {
      json(res, 500, { success: false, error: `Database error: ${error.message}` })
      return
    }

    if (!manifests || manifests.length === 0) {
      json(res, 404, {
        success: false,
        error: 'No manifest found for this repository',
      })
      return
    }

    const manifest = manifests[0]

    json(res, 200, {
      success: true,
      manifest: {
        manifestId: manifest.manifest_id,
        versionNumber: manifest.version_number,
        contentHash: manifest.content_hash,
        manifestContent: manifest.manifest_content,
        previousVersionId: manifest.previous_version_id || undefined,
        createdAt: manifest.created_at,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

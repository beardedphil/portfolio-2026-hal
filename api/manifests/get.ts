/**
 * API endpoint: Get Integration Manifest by version ID
 * 
 * POST /api/manifests/get
 * 
 * Body: {
 *   versionId?: string
 *   repoFullName?: string
 *   versionNumber?: number
 *   supabaseUrl?: string
 *   supabaseAnonKey?: string
 * }
 * 
 * Returns: {
 *   success: boolean
 *   manifest?: IntegrationManifest
 *   versionId?: string
 *   versionNumber?: number
 *   previousVersionId?: string | null
 *   created_at?: string
 *   error?: string
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

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
  res.setHeader('Access-Control-Allow-Origin', '*')
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
    json(res, 405, { success: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      versionId?: string
      repoFullName?: string
      versionNumber?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const versionId = typeof body.versionId === 'string' ? body.versionId.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const versionNumber = typeof body.versionNumber === 'number' ? body.versionNumber : undefined

    // Parse Supabase credentials
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let query = supabase.from('integration_manifests').select('*')

    if (versionId) {
      query = query.eq('id', versionId)
    } else if (repoFullName && versionNumber !== undefined) {
      query = query.eq('repo_full_name', repoFullName).eq('version_number', versionNumber)
    } else if (repoFullName) {
      // Get latest version for repo
      query = query.eq('repo_full_name', repoFullName).order('version_number', { ascending: false }).limit(1)
    } else {
      json(res, 400, {
        success: false,
        error: 'Either versionId or (repoFullName and optionally versionNumber) is required',
      })
      return
    }

    const { data: manifestRecord, error } = await query.maybeSingle()

    if (error) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch manifest: ${error.message}`,
      })
      return
    }

    if (!manifestRecord) {
      json(res, 404, {
        success: false,
        error: 'Manifest not found',
      })
      return
    }

    json(res, 200, {
      success: true,
      manifest: manifestRecord.manifest_content,
      versionId: manifestRecord.id,
      versionNumber: manifestRecord.version_number,
      previousVersionId: manifestRecord.previous_version_id,
      created_at: manifestRecord.created_at,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

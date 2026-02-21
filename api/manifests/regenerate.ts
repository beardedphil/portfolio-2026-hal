/**
 * API endpoint to regenerate Integration Manifest v0 for a repository.
 * Uses deterministic generation and version reuse based on content checksum.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { generateIntegrationManifest } from './_generate.js'

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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      defaultBranch?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : undefined

    if (!repoFullName || !defaultBranch) {
      json(res, 400, {
        success: false,
        error: 'repoFullName and defaultBranch are required.',
      })
      return
    }

    // Get GitHub token from session
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    if (!githubToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required. Please sign in with GitHub.',
      })
      return
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Generate manifest
    const { manifest, checksum } = await generateIntegrationManifest({
      repoFullName,
      defaultBranch,
      githubToken,
    })

    // Get or create manifest using database function
    const { data: dbResult, error: dbError } = await supabase.rpc('get_or_create_integration_manifest', {
      p_repo_full_name: repoFullName,
      p_default_branch: defaultBranch,
      p_schema_version: 'v0',
      p_goal: manifest.goal,
      p_stack: manifest.stack,
      p_constraints: manifest.constraints,
      p_conventions: manifest.conventions,
      p_content_checksum: checksum,
    })

    if (dbError) {
      json(res, 200, {
        success: false,
        error: `Failed to store manifest: ${dbError.message}`,
      })
      return
    }

    if (!dbResult || dbResult.length === 0) {
      json(res, 200, {
        success: false,
        error: 'Failed to create or retrieve manifest.',
      })
      return
    }

    const result = dbResult[0]
    const manifestId = result.manifest_id
    const isNew = result.is_new
    const createdAt = result.created_at

    // Fetch the full manifest record to return
    const { data: manifestRecord, error: fetchError } = await supabase
      .from('integration_manifests')
      .select('*')
      .eq('manifest_id', manifestId)
      .maybeSingle()

    if (fetchError || !manifestRecord) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch manifest: ${fetchError?.message || 'not found'}`,
      })
      return
    }

    // Determine if this is a new version by checking created_at timestamp
    // If created_at is very recent (within last 3 seconds), it's new
    const now = new Date()
    const created = new Date(createdAt)
    const secondsSinceCreation = (now.getTime() - created.getTime()) / 1000
    const isNewVersion = isNew && secondsSinceCreation < 3

    json(res, 200, {
      success: true,
      manifest: {
        manifest_id: manifestRecord.manifest_id,
        repo_full_name: manifestRecord.repo_full_name,
        default_branch: manifestRecord.default_branch,
        schema_version: manifestRecord.schema_version,
        goal: manifestRecord.goal,
        stack: manifestRecord.stack,
        constraints: manifestRecord.constraints,
        conventions: manifestRecord.conventions,
        content_checksum: manifestRecord.content_checksum,
        previous_version_id: manifestRecord.previous_version_id,
        created_at: manifestRecord.created_at,
      },
      is_new_version: isNewVersion,
      version_id: manifestRecord.manifest_id,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

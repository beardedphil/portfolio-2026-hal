/**
 * API endpoint for regenerating Integration Manifest v0
 * 
 * POST /api/manifests/regenerate
 * 
 * Body: {
 *   repoFullName: string
 *   defaultBranch?: string (defaults to 'main')
 *   schemaVersion?: string (defaults to 'v0')
 *   envIdentifiers?: Record<string, string>
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
 *     isNewVersion: boolean
 *     previousVersionId?: string
 *   }
 *   error?: string
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { generateManifest } from './_generate.js'
import { getSession } from '../_lib/github/session.js'
import { getDefaultBranch } from '../_lib/github/repos.js'

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
      defaultBranch?: string
      schemaVersion?: string
      envIdentifiers?: Record<string, string>
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

    // Get GitHub token from session
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    if (!githubToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required',
      })
      return
    }

    // Get default branch if not provided
    let defaultBranch = body.defaultBranch || 'main'
    if (!body.defaultBranch) {
      const branchResult = await getDefaultBranch(githubToken, body.repoFullName)
      if ('branch' in branchResult) {
        defaultBranch = branchResult.branch
      }
    }

    const schemaVersion = body.schemaVersion || 'v0'
    const envIdentifiers = body.envIdentifiers || {}

    // Generate manifest
    const manifestResult = await generateManifest(githubToken, {
      repoFullName: body.repoFullName,
      defaultBranch,
      schemaVersion,
      envIdentifiers,
    })

    if ('error' in manifestResult) {
      json(res, 500, { success: false, error: manifestResult.error })
      return
    }

    const { manifestContent, contentHash, inputs } = manifestResult

    // Get or create manifest version using database function
    const { data: manifestIdResult, error: dbError } = await supabase.rpc(
      'get_or_create_manifest_version',
      {
        p_repo_full_name: inputs.repoFullName,
        p_default_branch: inputs.defaultBranch,
        p_schema_version: inputs.schemaVersion,
        p_env_identifiers: inputs.envIdentifiers,
        p_manifest_content: manifestContent,
        p_content_hash: contentHash,
      }
    )

    if (dbError) {
      json(res, 500, { success: false, error: `Database error: ${dbError.message}` })
      return
    }

    const manifestId = manifestIdResult as string

    // Fetch the created/retrieved manifest to get version info
    const { data: manifest, error: fetchError } = await supabase
      .from('integration_manifests')
      .select('manifest_id, version_number, content_hash, previous_version_id, version_number')
      .eq('manifest_id', manifestId)
      .single()

    if (fetchError || !manifest) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch manifest: ${fetchError?.message || 'Not found'}`,
      })
      return
    }

    // Check if this is a new version (by checking if content_hash matches existing)
    const { data: existingManifest } = await supabase
      .from('integration_manifests')
      .select('manifest_id')
      .eq('repo_full_name', inputs.repoFullName)
      .eq('content_hash', contentHash)
      .neq('manifest_id', manifestId)
      .maybeSingle()

    const isNewVersion = !existingManifest

    json(res, 200, {
      success: true,
      manifest: {
        manifestId: manifest.manifest_id,
        versionNumber: manifest.version_number,
        contentHash: manifest.content_hash,
        manifestContent,
        isNewVersion,
        previousVersionId: manifest.previous_version_id || undefined,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

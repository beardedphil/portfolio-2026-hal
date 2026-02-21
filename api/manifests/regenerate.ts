/**
 * API endpoint to regenerate Integration Manifest v0 for a repo.
 * 
 * Deterministic generation: same inputs → same content hash → same version (reused).
 * When content changes, a new version is created and linked to the previous version.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { getSession } from '../_lib/github/session.js'
import { generateIntegrationManifest, type ManifestGenerationInputs } from './_generate.js'

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
      defaultBranch?: string
      schemaVersion?: string
      envIdentifiers?: Record<string, string>
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : undefined || 'main'
    const schemaVersion = typeof body.schemaVersion === 'string' ? body.schemaVersion.trim() : undefined || 'v0'
    const envIdentifiers = typeof body.envIdentifiers === 'object' && body.envIdentifiers !== null
      ? body.envIdentifiers as Record<string, string>
      : {}

    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
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

    // Get GitHub token from session
    const session = await getSession(req, res).catch(() => null)
    const githubToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim()

    if (!githubToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required. Please connect your GitHub account or provide GITHUB_TOKEN.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Generate manifest
    const inputs: ManifestGenerationInputs = {
      repoFullName,
      defaultBranch,
      schemaVersion,
      envIdentifiers,
    }

    const generationResult = await generateIntegrationManifest(githubToken, inputs)

    // Check if a version with this content hash already exists
    const { data: existingVersion, error: lookupError } = await supabase
      .from('integration_manifests')
      .select('manifest_id, created_at, previous_version_id')
      .eq('repo_full_name', repoFullName)
      .eq('content_hash', generationResult.contentHash)
      .maybeSingle()

    if (lookupError && lookupError.code !== 'PGRST116') {
      // PGRST116 is "not found", which is fine
      json(res, 200, {
        success: false,
        error: `Failed to lookup existing version: ${lookupError.message}`,
      })
      return
    }

    let manifestId: string
    let isNewVersion: boolean
    let previousVersionId: string | null = null

    if (existingVersion) {
      // Reuse existing version
      manifestId = existingVersion.manifest_id
      isNewVersion = false
      previousVersionId = existingVersion.previous_version_id
    } else {
      // Create new version
      // Find the latest version to link as previous
      const { data: latestVersion } = await supabase
        .from('integration_manifests')
        .select('manifest_id')
        .eq('repo_full_name', repoFullName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      previousVersionId = latestVersion?.manifest_id || null

      const { data: inserted, error: insertError } = await supabase
        .from('integration_manifests')
        .insert({
          repo_full_name: repoFullName,
          default_branch: defaultBranch,
          schema_version: schemaVersion,
          env_identifiers: envIdentifiers,
          goal: generationResult.manifest.goal,
          stack: generationResult.manifest.stack,
          constraints: generationResult.manifest.constraints,
          conventions: generationResult.manifest.conventions,
          content_hash: generationResult.contentHash,
          previous_version_id: previousVersionId,
          created_by: session?.github?.login || null,
        })
        .select('manifest_id')
        .single()

      if (insertError) {
        // Check if it's a unique constraint violation (race condition - another request created it)
        if (insertError.code === '23505' || insertError.message?.includes('unique constraint')) {
          // Retry lookup
          const { data: retryLookup } = await supabase
            .from('integration_manifests')
            .select('manifest_id, previous_version_id')
            .eq('repo_full_name', repoFullName)
            .eq('content_hash', generationResult.contentHash)
            .maybeSingle()
          
          if (retryLookup) {
            manifestId = retryLookup.manifest_id
            isNewVersion = false
            previousVersionId = retryLookup.previous_version_id
          } else {
            json(res, 200, {
              success: false,
              error: `Failed to insert manifest: ${insertError.message}`,
            })
            return
          }
        } else {
          json(res, 200, {
            success: false,
            error: `Failed to insert manifest: ${insertError.message}`,
          })
          return
        }
      } else {
        manifestId = inserted.manifest_id
        isNewVersion = true
      }
    }

    // Fetch the complete manifest record
    const { data: manifestRecord, error: fetchError } = await supabase
      .from('integration_manifests')
      .select('*')
      .eq('manifest_id', manifestId)
      .single()

    if (fetchError || !manifestRecord) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch manifest: ${fetchError?.message || 'Not found'}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      manifest: {
        manifest_id: manifestRecord.manifest_id,
        repo_full_name: manifestRecord.repo_full_name,
        default_branch: manifestRecord.default_branch,
        schema_version: manifestRecord.schema_version,
        env_identifiers: manifestRecord.env_identifiers,
        goal: manifestRecord.goal,
        stack: manifestRecord.stack,
        constraints: manifestRecord.constraints,
        conventions: manifestRecord.conventions,
        content_hash: manifestRecord.content_hash,
        previous_version_id: manifestRecord.previous_version_id,
        created_at: manifestRecord.created_at,
        created_by: manifestRecord.created_by,
      },
      is_new_version: isNewVersion,
      version_id: manifestRecord.manifest_id,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

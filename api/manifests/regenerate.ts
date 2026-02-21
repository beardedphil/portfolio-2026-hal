/**
 * API endpoint to regenerate an Integration Manifest for a repository.
 * Enforces deterministic versioning: identical content produces the same version_id.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { generateIntegrationManifest, generateVersionId } from './_generate.js'
import { generateManifestChecksum } from './_checksum.js'

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
      createdBy?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : undefined
    const schemaVersion = typeof body.schemaVersion === 'string' ? body.schemaVersion.trim() : 'v0'
    const createdBy = typeof body.createdBy === 'string' ? body.createdBy.trim() : undefined

    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
      return
    }

    if (!defaultBranch) {
      json(res, 400, {
        success: false,
        error: 'defaultBranch is required.',
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
    const manifest = await generateIntegrationManifest({
      repoFullName,
      defaultBranch,
      schemaVersion,
      supabaseUrl,
      supabaseAnonKey: supabaseKey,
    })

    // Generate deterministic version ID and checksum
    const versionId = generateVersionId(manifest)
    const contentChecksum = generateManifestChecksum(manifest)

    // Check if a manifest with this version_id already exists
    const { data: existingManifest, error: lookupError } = await supabase
      .from('hal_integration_manifests')
      .select('manifest_id, version_id, created_at')
      .eq('repo_full_name', repoFullName)
      .eq('version_id', versionId)
      .maybeSingle()

    if (lookupError && lookupError.code !== 'PGRST116') {
      json(res, 200, {
        success: false,
        error: `Failed to check existing manifest: ${lookupError.message}`,
      })
      return
    }

    // If identical version exists, return it without creating a new record
    if (existingManifest) {
      // Fetch the full manifest
      const { data: fullManifest, error: fetchError } = await supabase
        .from('hal_integration_manifests')
        .select('*')
        .eq('manifest_id', existingManifest.manifest_id)
        .single()

      if (fetchError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch existing manifest: ${fetchError.message}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        manifest: fullManifest,
        is_new_version: false,
        version_id: versionId,
        message: 'Manifest content unchanged - reused existing version',
      })
      return
    }

    // Get previous version_id for this repo
    const { data: previousManifest, error: previousError } = await supabase
      .from('hal_integration_manifests')
      .select('version_id')
      .eq('repo_full_name', repoFullName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousError && previousError.code !== 'PGRST116') {
      json(res, 200, {
        success: false,
        error: `Failed to fetch previous manifest: ${previousError.message}`,
      })
      return
    }

    const previousVersionId = previousManifest?.version_id || null

    // Insert new manifest version
    const { data: insertedManifest, error: insertError } = await supabase
      .from('hal_integration_manifests')
      .insert({
        repo_full_name: repoFullName,
        default_branch: defaultBranch,
        schema_version: schemaVersion,
        manifest_json: manifest,
        content_checksum: contentChecksum,
        version_id: versionId,
        previous_version_id: previousVersionId,
        created_by: createdBy || null,
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a unique constraint violation (version_id already exists)
      if (insertError.code === '23505' || insertError.message?.includes('unique constraint')) {
        // Race condition: another request created the same version
        // Fetch the existing one
        const { data: existing, error: fetchError } = await supabase
          .from('hal_integration_manifests')
          .select('*')
          .eq('repo_full_name', repoFullName)
          .eq('version_id', versionId)
          .single()

        if (fetchError) {
          json(res, 200, {
            success: false,
            error: `Failed to fetch existing manifest after race condition: ${fetchError.message}`,
          })
          return
        }

        json(res, 200, {
          success: true,
          manifest: existing,
          is_new_version: false,
          version_id: versionId,
          message: 'Manifest content unchanged - reused existing version (race condition)',
        })
        return
      }

      json(res, 200, {
        success: false,
        error: `Failed to insert manifest: ${insertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      manifest: insertedManifest,
      is_new_version: true,
      version_id: versionId,
      message: 'New manifest version created',
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

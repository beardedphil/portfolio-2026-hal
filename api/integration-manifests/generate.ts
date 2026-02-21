import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { generateManifest, generateManifestChecksum } from '../_lib/integration-manifest/generate.js'
import type { IntegrationManifestV0 } from '../_lib/integration-manifest/types.js'
import { getSession } from '../_lib/github/session.js'

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
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      defaultBranch?: string
      envIdentifiers?: Record<string, string>
      schemaVersion?: string
    }

    if (!body.repoFullName || !body.defaultBranch) {
      return json(res, 400, { error: 'repoFullName and defaultBranch are required' })
    }

    const schemaVersion = body.schemaVersion || 'v0'
    if (schemaVersion !== 'v0') {
      return json(res, 400, { error: `Unsupported schema version: ${schemaVersion}` })
    }

    // Get GitHub token from session
    const session = await getSession(req, res)
    const token = session.github?.accessToken
    if (!token) {
      return json(res, 401, { error: 'GitHub authentication required' })
    }

    // Generate manifest
    const manifestResult = await generateManifest(
      token,
      body.repoFullName,
      body.defaultBranch,
      body.envIdentifiers || {}
    )

    if ('error' in manifestResult) {
      return json(res, 500, { error: manifestResult.error })
    }

    const manifest = manifestResult.manifest
    const checksum = generateManifestChecksum(manifest)

    // Check if manifest with same checksum already exists
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } }
    )

    // Find existing manifest by checksum
    const { data: existingManifests, error: findError } = await supabase
      .from('integration_manifests')
      .select('*')
      .eq('repo_full_name', body.repoFullName)
      .eq('content_checksum', checksum)
      .eq('schema_version', schemaVersion)
      .order('version', { ascending: false })
      .limit(1)

    if (findError) {
      console.error('Error finding existing manifest:', findError)
      return json(res, 500, { error: 'Database error' })
    }

    if (existingManifests && existingManifests.length > 0) {
      // Reuse existing manifest
      const existing = existingManifests[0]
      return json(res, 200, {
        success: true,
        manifest: existing.manifest_json,
        manifest_id: existing.manifest_id,
        version: existing.version,
        content_checksum: existing.content_checksum,
        reused: true,
        message: 'Manifest with identical content already exists, reused existing version',
      })
    }

    // Get latest version to determine next version number
    const { data: latestManifests, error: latestError } = await supabase
      .from('integration_manifests')
      .select('version, manifest_id')
      .eq('repo_full_name', body.repoFullName)
      .eq('schema_version', schemaVersion)
      .order('version', { ascending: false })
      .limit(1)

    if (latestError) {
      console.error('Error finding latest manifest:', latestError)
      return json(res, 500, { error: 'Database error' })
    }

    const nextVersion = latestManifests && latestManifests.length > 0 
      ? latestManifests[0].version + 1 
      : 1
    const previousVersionId = latestManifests && latestManifests.length > 0
      ? latestManifests[0].manifest_id
      : null

    // Insert new manifest version
    const { data: newManifest, error: insertError } = await supabase
      .from('integration_manifests')
      .insert({
        repo_full_name: body.repoFullName,
        default_branch: body.defaultBranch,
        schema_version: schemaVersion,
        version: nextVersion,
        manifest_json: manifest,
        content_checksum: checksum,
        previous_version_id: previousVersionId,
        created_by: 'user', // TODO: Get actual user identifier from session
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting manifest:', insertError)
      return json(res, 500, { error: 'Failed to store manifest' })
    }

    return json(res, 200, {
      success: true,
      manifest: newManifest.manifest_json as IntegrationManifestV0,
      manifest_id: newManifest.manifest_id,
      version: newManifest.version,
      content_checksum: newManifest.content_checksum,
      previous_version_id: newManifest.previous_version_id,
      reused: false,
      message: 'New manifest version created',
    })
  } catch (err) {
    console.error('Error in generate manifest handler:', err)
    return json(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
}

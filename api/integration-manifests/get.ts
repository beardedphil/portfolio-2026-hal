import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import type { IntegrationManifestV0 } from '../_lib/integration-manifest/types.js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const repoFullName = url.searchParams.get('repoFullName')
    const schemaVersion = url.searchParams.get('schemaVersion') || 'v0'
    const version = url.searchParams.get('version') // Optional: specific version number

    if (!repoFullName) {
      return json(res, 400, { error: 'repoFullName query parameter is required' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } }
    )

    let query = supabase
      .from('integration_manifests')
      .select('*')
      .eq('repo_full_name', repoFullName)
      .eq('schema_version', schemaVersion)

    if (version) {
      const versionNum = parseInt(version, 10)
      if (isNaN(versionNum)) {
        return json(res, 400, { error: 'Invalid version number' })
      }
      query = query.eq('version', versionNum)
    } else {
      // Get latest version
      query = query.order('version', { ascending: false }).limit(1)
    }

    const { data: manifests, error } = await query

    if (error) {
      console.error('Error fetching manifest:', error)
      return json(res, 500, { error: 'Database error' })
    }

    if (!manifests || manifests.length === 0) {
      return json(res, 404, { error: 'Manifest not found' })
    }

    const manifest = manifests[0]

    return json(res, 200, {
      success: true,
      manifest: manifest.manifest_json as IntegrationManifestV0,
      manifest_id: manifest.manifest_id,
      version: manifest.version,
      content_checksum: manifest.content_checksum,
      previous_version_id: manifest.previous_version_id,
      created_at: manifest.created_at,
      created_by: manifest.created_by,
    })
  } catch (err) {
    console.error('Error in get manifest handler:', err)
    return json(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
}

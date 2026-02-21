/**
 * API endpoint to get Integration Manifest v0 by version ID or latest for a repository.
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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      manifestId?: string
      repoFullName?: string
      defaultBranch?: string
      version?: 'latest'
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const manifestId = typeof body.manifestId === 'string' ? body.manifestId.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : undefined
    const version = body.version

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    let manifestRecord: any = null
    let error: any = null

    if (manifestId) {
      // Fetch by manifest ID
      const { data, error: fetchError } = await supabase
        .from('integration_manifests')
        .select('*')
        .eq('manifest_id', manifestId)
        .maybeSingle()

      if (fetchError) {
        error = fetchError
      } else if (!data) {
        json(res, 200, {
          success: false,
          error: `Manifest ${manifestId} not found.`,
        })
        return
      } else {
        manifestRecord = data
      }
    } else if (repoFullName && defaultBranch && version === 'latest') {
      // Fetch latest for repo/branch
      const { data, error: fetchError } = await supabase
        .from('integration_manifests')
        .select('*')
        .eq('repo_full_name', repoFullName)
        .eq('default_branch', defaultBranch)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (fetchError) {
        error = fetchError
      } else if (!data) {
        json(res, 200, {
          success: false,
          error: `No manifest found for ${repoFullName} (${defaultBranch}).`,
        })
        return
      } else {
        manifestRecord = data
      }
    } else {
      json(res, 400, {
        success: false,
        error: 'Either manifestId, or (repoFullName + defaultBranch + version="latest") is required.',
      })
      return
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
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

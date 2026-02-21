/**
 * API endpoint: Generate/regenerate Integration Manifest v0
 * 
 * POST /api/manifests/generate
 * 
 * Body: {
 *   repoFullName: string
 *   defaultBranch: string
 *   schemaVersion?: string (default: 'v0')
 *   envIdentifiers?: Record<string, string>
 *   githubToken: string
 *   supabaseUrl?: string
 *   supabaseAnonKey?: string
 * }
 * 
 * Returns: {
 *   success: boolean
 *   manifest?: IntegrationManifest
 *   versionId?: string
 *   versionNumber?: number
 *   isNewVersion?: boolean
 *   previousVersionId?: string | null
 *   error?: string
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { generateManifest, computeManifestHash, type ManifestInputs } from '../_lib/manifest/generate.js'
import { fetchFileContents } from '../_lib/github/files.js'
import { listDirectoryContents } from '../_lib/github/files.js'
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
    // Get GitHub token from session
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    if (!githubToken) {
      json(res, 401, { success: false, error: 'GitHub authentication required' })
      return
    }

    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      defaultBranch?: string
      schemaVersion?: string
      envIdentifiers?: Record<string, string>
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : 'main'
    const schemaVersion = typeof body.schemaVersion === 'string' ? body.schemaVersion.trim() : 'v0'
    const envIdentifiers = typeof body.envIdentifiers === 'object' && body.envIdentifiers !== null
      ? body.envIdentifiers
      : {}

    if (!repoFullName) {
      json(res, 400, { success: false, error: 'repoFullName is required' })
      return
    }

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

    // Fetch repository files needed for manifest generation
    const repoFiles: ManifestInputs['repoFiles'] = {
      cursorRules: [],
      docs: [],
    }

    // Fetch README.md
    const readmeResult = await fetchFileContents(githubToken, repoFullName, 'README.md', 1000, defaultBranch)
    if (!('error' in readmeResult)) {
      repoFiles.readme = readmeResult
    }

    // Fetch package.json
    const packageJsonResult = await fetchFileContents(githubToken, repoFullName, 'package.json', 500, defaultBranch)
    if (!('error' in packageJsonResult)) {
      repoFiles.packageJson = packageJsonResult
    }

    // Fetch tsconfig.json
    const tsconfigResult = await fetchFileContents(githubToken, repoFullName, 'tsconfig.json', 500, defaultBranch)
    if (!('error' in tsconfigResult)) {
      repoFiles.tsconfig = tsconfigResult
    }

    // Fetch vite.config.ts
    const viteConfigResult = await fetchFileContents(githubToken, repoFullName, 'vite.config.ts', 500, defaultBranch)
    if (!('error' in viteConfigResult)) {
      repoFiles.viteConfig = viteConfigResult
    }

    // Fetch .cursor/rules/*.mdc files
    const cursorRulesDir = await listDirectoryContents(githubToken, repoFullName, '.cursor/rules', defaultBranch)
    if (!('error' in cursorRulesDir)) {
      for (const entry of cursorRulesDir.entries) {
        if (entry.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(
            githubToken,
            repoFullName,
            `.cursor/rules/${entry}`,
            2000,
            defaultBranch
          )
          if (!('error' in fileResult)) {
            repoFiles.cursorRules!.push(fileResult)
          }
        }
      }
    }

    // Fetch docs/process/*.mdc files
    const docsProcessDir = await listDirectoryContents(githubToken, repoFullName, 'docs/process', defaultBranch)
    if (!('error' in docsProcessDir)) {
      for (const entry of docsProcessDir.entries) {
        if (entry.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(
            githubToken,
            repoFullName,
            `docs/process/${entry}`,
            2000,
            defaultBranch
          )
          if (!('error' in fileResult)) {
            repoFiles.docs!.push(fileResult)
          }
        }
      }
    }

    // Generate manifest
    const manifestInputs: ManifestInputs = {
      repoFullName,
      defaultBranch,
      schemaVersion,
      envIdentifiers,
      repoFiles,
    }

    const manifest = generateManifest(manifestInputs)
    const contentHash = computeManifestHash(manifest)

    // Check if manifest with this hash already exists
    const { data: existingManifest, error: lookupError } = await supabase
      .from('integration_manifests')
      .select('id, version_number, repo_full_name')
      .eq('content_hash', contentHash)
      .maybeSingle()

    if (lookupError && lookupError.code !== 'PGRST116') {
      // PGRST116 is "not found", which is fine
      json(res, 500, {
        success: false,
        error: `Failed to lookup existing manifest: ${lookupError.message}`,
      })
      return
    }

    let versionId: string
    let versionNumber: number
    let isNewVersion: boolean
    let previousVersionId: string | null = null

    if (existingManifest) {
      // Reuse existing version
      versionId = existingManifest.id
      versionNumber = existingManifest.version_number
      isNewVersion = false
    } else {
      // Create new version
      // Get the latest version for this repo to link as previous
      const { data: latestVersion } = await supabase
        .from('integration_manifests')
        .select('id, version_number')
        .eq('repo_full_name', repoFullName)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestVersion) {
        previousVersionId = latestVersion.id
        versionNumber = latestVersion.version_number + 1
      } else {
        versionNumber = 1
      }

      // Insert new manifest
      const { data: newManifest, error: insertError } = await supabase
        .from('integration_manifests')
        .insert({
          repo_full_name: repoFullName,
          default_branch: defaultBranch,
          schema_version: schemaVersion,
          env_identifiers: envIdentifiers,
          manifest_content: manifest,
          content_hash: contentHash,
          previous_version_id: previousVersionId,
          version_number: versionNumber,
        })
        .select('id')
        .single()

      if (insertError || !newManifest) {
        json(res, 500, {
          success: false,
          error: `Failed to insert manifest: ${insertError?.message || 'Unknown error'}`,
        })
        return
      }

      versionId = newManifest.id
      isNewVersion = true
    }

    json(res, 200, {
      success: true,
      manifest,
      versionId,
      versionNumber,
      isNewVersion,
      previousVersionId,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

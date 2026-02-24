import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { generateManifest, generateManifestChecksum } from '../_lib/integration-manifest/generate.js'
import type { IntegrationManifestV0 } from '../_lib/integration-manifest/types.js'
import { getSession } from '../_lib/github/session.js'
import { getLatestManifest } from '../_lib/integration-manifest/context-integration.js'

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

/**
 * Generates and persists an Integration Manifest artifact for a ticket.
 * This endpoint:
 * 1. Generates or retrieves the latest manifest for the repo
 * 2. Stores it as an artifact linked to the ticket
 * 3. Returns the artifact information
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      repoFullName?: string
      defaultBranch?: string
      envIdentifiers?: Record<string, string>
      projectId?: string
      schemaVersion?: string
    }

    if (!body.ticketId) {
      return json(res, 400, { error: 'ticketId is required' })
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

    // Get Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } }
    )

    // Lookup ticket to get repo information
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, display_id, repo_full_name')
      .eq('display_id', body.ticketId)
      .single()

    if (ticketError || !ticket) {
      return json(res, 404, { error: `Ticket ${body.ticketId} not found` })
    }

    // Always generate manifest to ensure idempotency (same inputs = same checksum = reuse existing)
    // Generate manifest
    const manifestResult = await generateManifest(
      token,
      body.repoFullName,
      body.defaultBranch,
      body.envIdentifiers || {},
      body.projectId
    )

    if ('error' in manifestResult) {
      return json(res, 500, { error: manifestResult.error })
    }

    const manifest = manifestResult.manifest
    const checksum = generateManifestChecksum(manifest)

    // Check if manifest with same checksum already exists (idempotency - deterministic regeneration)
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

    let manifestRecord: any

    if (existingManifests && existingManifests.length > 0) {
      // Reuse existing manifest (idempotent - same inputs produce same checksum)
      manifestRecord = existingManifests[0]
    } else {
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
            created_by: 'system', // Auto-generated artifact
          })
          .select()
          .single()

        if (insertError) {
          console.error('Error inserting manifest:', insertError)
          return json(res, 500, { error: 'Failed to store manifest' })
        }

        manifestRecord = newManifest as any
    }

    if (!manifestRecord) {
      return json(res, 500, { error: 'Failed to get or generate manifest' })
    }

    const manifest = manifestRecord.manifest_json as IntegrationManifestV0

    // Format manifest as markdown for artifact storage
    const artifactBody = formatManifestAsMarkdown(manifest, manifestRecord)

    // Store as artifact
    const artifactTitle = `Integration Manifest for ticket ${body.ticketId}`
    const canonicalTitle = `Integration Manifest for ticket ${body.ticketId}`

    // Check if artifact already exists
    const { data: existingArtifacts, error: artifactFindError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id')
      .eq('ticket_pk', ticket.pk)
      .eq('title', canonicalTitle)
      .eq('agent_type', 'system')
      .limit(1)

    if (artifactFindError) {
      console.error('Error finding existing artifact:', artifactFindError)
      return json(res, 500, { error: 'Database error' })
    }

    let artifactId: string
    let action: 'created' | 'updated' = 'created'

    if (existingArtifacts && existingArtifacts.length > 0) {
      // Update existing artifact (idempotent regeneration)
      const { data: updatedArtifact, error: updateError } = await supabase
        .from('agent_artifacts')
        .update({
          body_md: artifactBody,
          updated_at: new Date().toISOString(),
        })
        .eq('artifact_id', existingArtifacts[0].artifact_id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating artifact:', updateError)
        return json(res, 500, { error: 'Failed to update artifact' })
      }

      artifactId = updatedArtifact.artifact_id
      action = 'updated'
    } else {
      // Insert new artifact
      const { data: newArtifact, error: insertError } = await supabase
        .from('agent_artifacts')
        .insert({
          ticket_pk: ticket.pk,
          repo_full_name: body.repoFullName,
          artifact_type: 'integration-manifest',
          agent_type: 'system',
          title: canonicalTitle,
          body_md: artifactBody,
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error inserting artifact:', insertError)
        return json(res, 500, { error: 'Failed to store artifact' })
      }

      artifactId = newArtifact.artifact_id
    }

    return json(res, 200, {
      success: true,
      artifact_id: artifactId,
      manifest_id: manifestRecord.manifest_id,
      version: manifestRecord.version,
      content_checksum: manifestRecord.content_checksum,
      previous_version_id: manifestRecord.previous_version_id,
      created_at: manifestRecord.created_at,
      action,
      message: action === 'updated' 
        ? 'Integration Manifest artifact updated' 
        : 'Integration Manifest artifact created',
    })
  } catch (err) {
    console.error('Error in generate artifact handler:', err)
    return json(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
}

/**
 * Formats the manifest as markdown for artifact storage
 */
function formatManifestAsMarkdown(
  manifest: IntegrationManifestV0,
  record: { manifest_id: string; version: number; created_at: string; content_checksum: string; previous_version_id: string | null }
): string {
  return `# Integration Manifest

## Metadata

- **Schema Version:** ${manifest.schema_version}
- **Manifest Version:** ${record.version}
- **Manifest ID:** \`${record.manifest_id}\`
- **Last Updated:** ${new Date(record.created_at).toISOString()}
- **Content Checksum:** \`${record.content_checksum.substring(0, 16)}...\`
${record.previous_version_id ? `- **Previous Version ID:** \`${record.previous_version_id}\`` : ''}

## Repository Information

- **Repository:** ${manifest.repo_full_name}
- **Default Branch:** ${manifest.default_branch}
- **Project ID:** ${manifest.project_id}

## Project Manifest

### Goal

${manifest.project_manifest.goal}

### Stack

${Object.keys(manifest.project_manifest.stack).length > 0
  ? Object.entries(manifest.project_manifest.stack)
      .map(([category, items]) => `**${category}:**\n${items.map(item => `- ${item}`).join('\n')}`)
      .join('\n\n')
  : 'No stack information available'}

### Constraints

${Object.keys(manifest.project_manifest.constraints).length > 0
  ? Object.entries(manifest.project_manifest.constraints)
      .map(([key, value]) => `**${key}:** ${value}`)
      .join('\n\n')
  : 'No constraints documented'}

### Conventions

${Object.keys(manifest.project_manifest.conventions).length > 0
  ? Object.entries(manifest.project_manifest.conventions)
      .map(([key, value]) => `**${key}:** ${value}`)
      .join('\n\n')
  : 'No conventions documented'}

## Environment Identifiers

${Object.keys(manifest.env_identifiers).length > 0
  ? Object.entries(manifest.env_identifiers)
      .map(([key, value]) => `- **${key}:** ${value}`)
      .join('\n')
  : 'No environment identifiers'}

## Generated At

${manifest.generated_at}

## Full Manifest (JSON)

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`
`
}

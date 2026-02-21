/**
 * Context Bundle v0 Builder
 * 
 * Deterministically assembles a Context Bundle from authoritative sources:
 * - RED (Requirement Expansion Document)
 * - Integration Manifest
 * - Repo deltas (git diff)
 * - Distilled artifacts
 * - Instructions (role-specific)
 * 
 * The builder ensures deterministic output with stable checksums.
 */

import { createClient } from '@supabase/supabase-js'
import { getLatestManifest } from '../_lib/integration-manifest/context-integration.js'
import { distillArtifact } from './_distill.js'
import type { DistilledArtifact } from './_distill.js'

export interface BundleBuilderOptions {
  ticketPk: string
  ticketId: string
  repoFullName: string
  role: string
  supabaseUrl: string
  supabaseAnonKey: string
  selectedArtifactIds?: string[]
  gitRef?: {
    pr_url?: string
    pr_number?: number
    base_sha?: string
    head_sha?: string
  } | null
}

export interface ContextBundleV0 {
  meta: {
    project_id: string
    ticket_id: string
    role: string
    bundle_id?: string // Set after creation
    created_at: string
    content_checksum?: string // Set after creation
    bundle_checksum?: string // Set after creation
  }
  project_manifest: {
    goal: string
    stack: Record<string, string[]>
    constraints: Record<string, string>
    conventions: Record<string, string>
  }
  ticket: {
    title: string
    description: string
    acceptance_criteria: string[]
    out_of_scope: string[]
    definition_of_done: string[]
  }
  state_snapshot: {
    statuses: Record<string, unknown>
    open_findings: string[]
    failing_tests: string[]
    last_known_good_commit: string | null
  }
  recent_deltas: {
    summary: string
    files_touched: string[]
  }
  repo_context: {
    file_pointers: Array<{
      path: string
      snippet?: string
    }>
  }
  relevant_artifacts: Array<{
    artifact_id: string
    artifact_title: string
    summary: string
    hard_facts: string[]
    keywords: string[]
  }>
  instructions: {
    role_specific: string
    output_schema: string
  }
}

export interface BuilderResult {
  success: boolean
  bundle?: ContextBundleV0
  redReference?: { red_id: string; version: number } | null
  integrationManifestReference?: {
    manifest_id: string
    version: number
    schema_version: string
  } | null
  error?: string
}

/**
 * Builds a Context Bundle v0 from authoritative sources.
 * 
 * @param options - Builder options
 * @returns Builder result with bundle or error
 */
export async function buildContextBundleV0(
  options: BundleBuilderOptions
): Promise<BuilderResult> {
  const { ticketPk, ticketId, repoFullName, role, supabaseUrl, supabaseAnonKey, selectedArtifactIds = [], gitRef = null } = options

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  try {
    // 1. Fetch RED (latest valid) - REQUIRED
    const { data: redData, error: redError } = await supabase.rpc('get_latest_valid_red', {
      p_repo_full_name: repoFullName,
      p_ticket_pk: ticketPk,
    })

    if (redError || !redData || redData.length === 0) {
      return {
        success: false,
        error: `No valid RED found for ticket ${ticketId}. Bundle creation refused.`,
      }
    }

    const redDocument = redData[0]
    const redJson = redDocument.red_json as any
    const redReference = {
      red_id: redDocument.red_id,
      version: redDocument.version,
    }

    // Extract ticket data from RED
    const ticketData = extractTicketDataFromRed(redJson)

    // 2. Fetch Integration Manifest (latest v0) - REQUIRED
    const manifestRef = await getLatestManifest(repoFullName, 'v0')
    if (!manifestRef) {
      return {
        success: false,
        error: `No Integration Manifest found for repository ${repoFullName}. Bundle creation refused.`,
      }
    }

    const integrationManifestReference = {
      manifest_id: manifestRef.manifest_id,
      version: manifestRef.version,
      schema_version: manifestRef.schema_version,
    }

    const projectManifest = manifestRef.manifest_json.project_manifest

    // 3. Get repo deltas (git diff summary)
    const recentDeltas = await getRecentDeltas(repoFullName, gitRef)

    // 4. Get repo context (file pointers + snippets)
    const repoContext = await getRepoContext(repoFullName, gitRef)

    // 5. Get state snapshot (placeholder for now - can be enhanced later)
    const stateSnapshot = {
      statuses: {},
      open_findings: [],
      failing_tests: [],
      last_known_good_commit: gitRef?.base_sha || null,
    }

    // 6. Get relevant artifacts (distilled)
    const relevantArtifacts = await getRelevantArtifacts(
      supabase,
      ticketPk,
      selectedArtifactIds
    )

    // 7. Get instructions (role-specific)
    const instructions = await getRoleSpecificInstructions(supabase, repoFullName, role)

    // 8. Assemble bundle
    const bundle: ContextBundleV0 = {
      meta: {
        project_id: manifestRef.manifest_json.project_id,
        ticket_id: ticketId,
        role,
        created_at: new Date().toISOString(),
      },
      project_manifest: {
        goal: projectManifest.goal,
        stack: projectManifest.stack,
        constraints: projectManifest.constraints,
        conventions: projectManifest.conventions,
      },
      ticket: ticketData,
      state_snapshot: stateSnapshot,
      recent_deltas: recentDeltas,
      repo_context: repoContext,
      relevant_artifacts: relevantArtifacts,
      instructions,
    }

    return {
      success: true,
      bundle,
      redReference,
      integrationManifestReference,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error building bundle',
    }
  }
}

/**
 * Extracts ticket data from RED JSON.
 * Handles various RED JSON structures.
 */
function extractTicketDataFromRed(redJson: any): {
  title: string
  description: string
  acceptance_criteria: string[]
  out_of_scope: string[]
  definition_of_done: string[]
} {
  // RED JSON structure may vary, so we try multiple extraction strategies
  const title = redJson.title || redJson.goal || redJson['Goal (one sentence)'] || ''
  const description = redJson.description || redJson.body || redJson.body_md || ''

  // Extract acceptance criteria
  let acceptance_criteria: string[] = []
  if (Array.isArray(redJson.acceptance_criteria)) {
    acceptance_criteria = redJson.acceptance_criteria
  } else if (redJson['Acceptance criteria (UI-only)']) {
    const acSection = redJson['Acceptance criteria (UI-only)']
    if (Array.isArray(acSection)) {
      acceptance_criteria = acSection
    } else if (typeof acSection === 'string') {
      // Parse markdown checkboxes
      acceptance_criteria = acSection
        .split('\n')
        .filter((line: string) => line.trim().startsWith('- [ ]'))
        .map((line: string) => line.replace(/^-\s*\[\s*\]\s*/, '').trim())
        .filter((line: string) => line.length > 0)
    }
  }

  // Extract out of scope
  let out_of_scope: string[] = []
  if (Array.isArray(redJson.out_of_scope)) {
    out_of_scope = redJson.out_of_scope
  } else if (redJson['Non-goals']) {
    const nonGoals = redJson['Non-goals']
    if (Array.isArray(nonGoals)) {
      out_of_scope = nonGoals
    } else if (typeof nonGoals === 'string') {
      out_of_scope = nonGoals
        .split('\n')
        .filter((line: string) => line.trim().startsWith('-'))
        .map((line: string) => line.replace(/^-\s*/, '').trim())
        .filter((line: string) => line.length > 0)
    }
  }

  // Extract definition of done
  let definition_of_done: string[] = []
  if (Array.isArray(redJson.definition_of_done)) {
    definition_of_done = redJson.definition_of_done
  } else if (redJson['Definition of Done']) {
    const dod = redJson['Definition of Done']
    if (Array.isArray(dod)) {
      definition_of_done = dod
    } else if (typeof dod === 'string') {
      definition_of_done = dod
        .split('\n')
        .filter((line: string) => line.trim().startsWith('-'))
        .map((line: string) => line.replace(/^-\s*/, '').trim())
        .filter((line: string) => line.length > 0)
    }
  }

  return {
    title: String(title),
    description: String(description),
    acceptance_criteria,
    out_of_scope,
    definition_of_done,
  }
}

/**
 * Gets recent deltas (git diff summary).
 * Attempts to fetch actual git diff from PR if available.
 */
async function getRecentDeltas(
  repoFullName: string,
  gitRef: { pr_url?: string; base_sha?: string; head_sha?: string } | null
): Promise<{ summary: string; files_touched: string[] }> {
  // If PR URL is available, try to fetch diff from GitHub
  if (gitRef?.pr_url) {
    try {
      // Try to get GitHub token from environment
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
      if (githubToken) {
        const { fetchPullRequestFiles } = await import('../_lib/github/pullRequests.js')
        const filesResult = await fetchPullRequestFiles(githubToken, gitRef.pr_url)
        
        if (!('error' in filesResult) && filesResult.files) {
          const files = filesResult.files
          const filesTouched = files.map((f) => f.filename)
          const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
          const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)
          
          return {
            summary: `PR ${gitRef.pr_url}: ${files.length} file(s) changed (+${totalAdditions}/-${totalDeletions} lines)`,
            files_touched: filesTouched,
          }
        }
      }
    } catch (err) {
      // Fall through to placeholder
      console.warn('Failed to fetch PR diff:', err)
    }
  }
  
  // Fallback: return summary based on SHAs if available
  if (gitRef?.base_sha && gitRef?.head_sha) {
    return {
      summary: `Git diff from ${gitRef.base_sha.substring(0, 7)} to ${gitRef.head_sha.substring(0, 7)}`,
      files_touched: [],
    }
  }
  
  return {
    summary: 'No git deltas available',
    files_touched: [],
  }
}

/**
 * Gets repo context (file pointers + snippets).
 * Attempts to fetch key files from the repository.
 */
async function getRepoContext(
  repoFullName: string,
  gitRef: { head_sha?: string } | null
): Promise<{
  file_pointers: Array<{ path: string; snippet?: string }>
}> {
  // Key files to include in repo context (capped to avoid large bundles)
  const keyFiles = [
    'README.md',
    'package.json',
    '.cursor/rules/agent-instructions.mdc',
    'docs/process/hal-tool-call-contract.mdc',
  ]
  
  const filePointers: Array<{ path: string; snippet?: string }> = []
  
  try {
    // Try to get GitHub token from environment
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    if (githubToken) {
      const { fetchFileContents } = await import('../_lib/github/files.js')
      const ref = gitRef?.head_sha || undefined
      
      for (const filePath of keyFiles) {
        const result = await fetchFileContents(githubToken, repoFullName, filePath, 50, ref)
        if (!('error' in result) && result.content) {
          // Truncate to first 500 characters for snippet
          const snippet = result.content.length > 500 
            ? result.content.substring(0, 500) + '...'
            : result.content
          filePointers.push({
            path: filePath,
            snippet,
          })
        }
      }
    }
  } catch (err) {
    // Fall through - return empty or partial list
    console.warn('Failed to fetch repo context:', err)
  }
  
  return {
    file_pointers: filePointers,
  }
}

/**
 * Gets relevant artifacts (distilled).
 */
async function getRelevantArtifacts(
  supabase: ReturnType<typeof createClient>,
  ticketPk: string,
  selectedArtifactIds: string[]
): Promise<Array<{
  artifact_id: string
  artifact_title: string
  summary: string
  hard_facts: string[]
  keywords: string[]
}>> {
  if (selectedArtifactIds.length === 0) {
    return []
  }

  // Fetch artifacts
  const { data: artifacts, error: artifactsError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, title, body_md')
    .in('artifact_id', selectedArtifactIds)
    .eq('ticket_pk', ticketPk)

  if (artifactsError || !artifacts || artifacts.length === 0) {
    return []
  }

  // Distill each artifact
  const distilledArtifacts: Array<{
    artifact_id: string
    artifact_title: string
    summary: string
    hard_facts: string[]
    keywords: string[]
  }> = []

  for (const artifact of artifacts) {
    const result = await distillArtifact(artifact.body_md || '', artifact.title || '')

    if (result.success && result.distilled) {
      distilledArtifacts.push({
        artifact_id: artifact.artifact_id,
        artifact_title: artifact.title || 'Untitled',
        summary: result.distilled.summary,
        hard_facts: result.distilled.hard_facts,
        keywords: result.distilled.keywords,
      })
    }
  }

  return distilledArtifacts
}

/**
 * Gets role-specific instructions.
 */
async function getRoleSpecificInstructions(
  supabase: ReturnType<typeof createClient>,
  repoFullName: string,
  role: string
): Promise<{ role_specific: string; output_schema: string }> {
  // Map role to agent type
  const roleToAgentType: Record<string, string> = {
    'implementation-agent': 'implementation',
    'qa-agent': 'qa',
    'project-manager': 'project-manager',
  }
  const agentType = roleToAgentType[role] || role

  // Fetch instructions
  const { data: instructions, error } = await supabase
    .from('agent_instructions')
    .select('content_md, title')
    .eq('repo_full_name', repoFullName)
    .or(`always_apply.eq.true,agent_types.cs.{${agentType}},agent_types.cs.{all}`)
    .order('filename')

  if (error || !instructions || instructions.length === 0) {
    return {
      role_specific: 'No instructions available',
      output_schema: 'No output schema defined',
    }
  }

  // Combine instructions
  const roleSpecific = instructions
    .map((inst) => `# ${inst.title}\n\n${inst.content_md || ''}`)
    .join('\n\n---\n\n')

  // Output schema is typically defined in instructions, but for now return placeholder
  const outputSchema = 'See instructions for output schema requirements'

  return {
    role_specific: roleSpecific,
    output_schema: outputSchema,
  }
}

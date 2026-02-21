/**
 * Context Bundle v0 Builder
 * 
 * Deterministically assembles context bundles from authoritative sources:
 * - RED (Requirement Expansion Document)
 * - Integration Manifest
 * - Git deltas (from PR)
 * - Repo context (file pointers + snippets)
 * - Distilled artifacts
 * - Role-specific instructions
 */

import { createClient } from '@supabase/supabase-js'
import { getLatestManifest } from '../_lib/integration-manifest/context-integration.js'
import { distillArtifact } from './_distill.js'
import { fetchPullRequestDiff } from '../_lib/github/pullRequests.js'
import { getServerSupabase } from '../agent-runs/_shared.js'
import { generateContentChecksum, generateBundleChecksum } from './_checksum.js'

export interface BuildContextBundleV0Params {
  ticketPk: string
  ticketId: string
  repoFullName: string
  role: string
  supabase?: ReturnType<typeof createClient>
  githubToken?: string
  prUrl?: string
}

export interface ContextBundleV0 {
  meta: {
    project_id: string
    ticket_id: string
    role: string
    bundle_id?: string // Will be set after insertion
    created_at: string
    content_checksum: string
    bundle_checksum?: string // Will be set after insertion
  }
  project_manifest: {
    goal: string
    stack: Record<string, string[]>
    constraints: Record<string, string>
    conventions: Record<string, string>
  } | null
  ticket: {
    title: string
    description: string
    acceptance_criteria: string[]
    out_of_scope: string[]
    definition_of_done: string[]
  }
  state_snapshot: {
    statuses: Record<string, string>
    open_findings: string[]
    failing_tests: string[]
    last_known_good_commit: string | null
  }
  recent_deltas: {
    summary: string
    files_touched: string[]
  } | null
  repo_context: {
    file_pointers: Array<{
      path: string
      snippet: string
    }>
  }
  relevant_artifacts: Array<{
    artifact_id: string
    artifact_title: string
    summary: string
    hard_facts: string[]
  }>
  instructions: Array<{
    topic_id: string
    filename: string
    title: string
    content_md: string
  }>
}

/**
 * Builds a Context Bundle v0 from authoritative sources.
 * 
 * @param params - Builder parameters
 * @returns Bundle JSON or error
 */
export async function buildContextBundleV0(
  params: BuildContextBundleV0Params
): Promise<{ success: true; bundle: ContextBundleV0; redReference: { red_id: string; version: number } } | { success: false; error: string }> {
  const { ticketPk, ticketId, repoFullName, role, supabase: providedSupabase, githubToken, prUrl } = params

  // Use provided Supabase client or create one with server credentials
  const supabase = providedSupabase || getServerSupabase()

  // 1. Fetch latest valid RED - REQUIRED
  const { data: redData, error: redError } = await supabase.rpc('get_latest_valid_red', {
    p_repo_full_name: repoFullName,
    p_ticket_pk: ticketPk,
  })

  if (redError || !redData || redData.length === 0) {
    return {
      success: false,
      error: `No valid RED found for ticket ${ticketId}. Bundle builder requires a valid RED document.`,
    }
  }

  const redDocument = redData[0] as {
    red_id: string
    version: number
    red_json: any
  }

  const redJson = redDocument.red_json as any

  // Extract ticket data from RED
  const ticketTitle = typeof redJson?.title === 'string' ? redJson.title : ''
  const ticketDescription = typeof redJson?.description === 'string' ? redJson.description : ''
  const acceptanceCriteria = Array.isArray(redJson?.acceptance_criteria)
    ? redJson.acceptance_criteria.filter((item: unknown) => typeof item === 'string')
    : []
  const outOfScope = Array.isArray(redJson?.out_of_scope)
    ? redJson.out_of_scope.filter((item: unknown) => typeof item === 'string')
    : []
  const definitionOfDone = Array.isArray(redJson?.definition_of_done)
    ? redJson.definition_of_done.filter((item: unknown) => typeof item === 'string')
    : []

  // 2. Fetch Integration Manifest (latest v0)
  const manifestRef = await getLatestManifest(repoFullName, 'v0')
  const projectManifest = manifestRef?.manifest_json?.project_manifest || null

  // 3. Get git deltas from PR (if available)
  let recentDeltas: { summary: string; files_touched: string[] } | null = null
  if (prUrl && githubToken) {
    try {
      const diffResult = await fetchPullRequestDiff(githubToken, prUrl)
      if ('diff' in diffResult && diffResult.diff) {
        // Extract file names from diff
        const fileMatches = diffResult.diff.match(/^diff --git a\/(.+?) b\//gm) || []
        const filesTouched = fileMatches.map((match) => {
          const fileMatch = match.match(/^diff --git a\/(.+?) b\//)
          return fileMatch ? fileMatch[1] : ''
        }).filter(Boolean)

        // Create summary (first 500 chars of diff)
        const summary = diffResult.diff.substring(0, 500) + (diffResult.diff.length > 500 ? '...' : '')

        recentDeltas = {
          summary,
          files_touched: filesTouched,
        }
      }
    } catch (err) {
      // Non-fatal: continue without deltas
      console.warn('Failed to fetch git deltas:', err)
    }
  }

  // 4. Get repo context (file pointers + snippets)
  // For now, we'll use a simple approach: get key files from the repo
  // This could be enhanced to analyze the codebase and identify relevant files
  const repoContext: { file_pointers: Array<{ path: string; snippet: string }> } = {
    file_pointers: [],
  }

  // TODO: Implement file discovery and snippet extraction
  // For v0, we'll leave this empty or populate with basic structure

  // 5. Distill relevant artifacts
  const { data: artifacts, error: artifactsError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, title, body_md')
    .eq('ticket_pk', ticketPk)
    .order('created_at', { ascending: false })
    .limit(20) // Limit to most recent 20 artifacts

  const relevantArtifacts: Array<{
    artifact_id: string
    artifact_title: string
    summary: string
    hard_facts: string[]
  }> = []

  if (!artifactsError && artifacts) {
    for (const artifact of artifacts) {
      const result = await distillArtifact(artifact.body_md || '', artifact.title || '')
      if (result.success && result.distilled) {
        relevantArtifacts.push({
          artifact_id: artifact.artifact_id,
          artifact_title: artifact.title || 'Untitled',
          summary: result.distilled.summary,
          hard_facts: result.distilled.hard_facts,
        })
      }
    }
  }

  // 6. Get role-specific instructions
  const { data: instructions, error: instructionsError } = await supabase
    .from('agent_instructions')
    .select('topic_id, filename, title, content_md, agent_types, always_apply')
    .eq('repo_full_name', repoFullName)
    .order('filename')

  const roleInstructions: Array<{
    topic_id: string
    filename: string
    title: string
    content_md: string
  }> = []

  if (!instructionsError && instructions) {
    // Map role to agent_type
    const roleToAgentType: Record<string, string> = {
      'implementation-agent': 'implementation',
      'qa-agent': 'qa',
      'project-manager': 'project-manager',
      'process-review': 'process-review',
    }
    const agentType = roleToAgentType[role] || role

    for (const inst of instructions) {
      const agentTypes = inst.agent_types || []
      if (
        inst.always_apply ||
        agentTypes.includes('all') ||
        agentTypes.includes(agentType)
      ) {
        roleInstructions.push({
          topic_id: inst.topic_id,
          filename: inst.filename,
          title: inst.title,
          content_md: inst.content_md || '',
        })
      }
    }
  }

  // 7. Assemble bundle
  const bundle: ContextBundleV0 = {
    meta: {
      project_id: projectManifest ? manifestRef!.manifest_json.project_id : '',
      ticket_id: ticketId,
      role,
      created_at: new Date().toISOString(),
      content_checksum: '', // Will be calculated below
    },
    project_manifest: projectManifest,
    ticket: {
      title: ticketTitle,
      description: ticketDescription,
      acceptance_criteria: acceptanceCriteria,
      out_of_scope: outOfScope,
      definition_of_done: definitionOfDone,
    },
    state_snapshot: {
      statuses: {},
      open_findings: [],
      failing_tests: [],
      last_known_good_commit: null,
    },
    recent_deltas: recentDeltas,
    repo_context: repoContext,
    relevant_artifacts: relevantArtifacts,
    instructions: roleInstructions,
  }

  // Compute content checksum deterministically
  const contentChecksum = generateContentChecksum(bundle)
  bundle.meta.content_checksum = contentChecksum

  return {
    success: true,
    bundle,
    redReference: {
      red_id: redDocument.red_id,
      version: redDocument.version,
    },
  }
}

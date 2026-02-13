import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from '../artifacts/_shared.js'
import { hasSubstantiveContent } from '../artifacts/_validation.js'

export type AgentType = 'implementation' | 'qa'

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error('Supabase server env is missing (SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY).')
  }
  return createClient(url, key)
}

export function getCursorApiKey(): string {
  const key = (process.env.CURSOR_API_KEY || process.env.VITE_CURSOR_API_KEY || '').trim()
  if (!key) throw new Error('Cursor API is not configured (CURSOR_API_KEY).')
  return key
}

export function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 140)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

export function appendProgress(progress: any[] | null | undefined, message: string) {
  const arr = Array.isArray(progress) ? progress.slice(-49) : []
  arr.push({ at: new Date().toISOString(), message })
  return arr
}

export type ProgressEntry = { at: string; message: string }

/** Build worklog body from progress array and current status (no PR required). */
export function buildWorklogBodyFromProgress(
  displayId: string,
  progress: ProgressEntry[],
  cursorStatus: string,
  summary: string | null,
  errMsg: string | null,
  prUrl: string | null
): string {
  const lines = [
    `# Worklog: ${displayId}`,
    '',
    '## Progress',
    ...progress.map((p) => `- **${p.at}** — ${p.message}`),
    '',
    `**Current status:** ${cursorStatus}`,
  ]
  if (summary) lines.push('', '## Summary', summary)
  if (errMsg) lines.push('', '## Error', errMsg)
  if (prUrl) lines.push('', '**Pull request:** ' + prUrl)
  return lines.join('\n')
}

/** Result type for upsertArtifact so callers can narrow safely. */
export type UpsertArtifactResult = { ok: true } | { ok: false; error: string }

/** Upsert one artifact: update body_md if row exists, otherwise insert. Returns error message if failed.
 * Handles duplicates and empty artifacts (0121).
 * Validates content before storing to prevent blank/placeholder artifacts (0137).
 */
export async function upsertArtifact(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  repoFullName: string,
  agentType: string,
  title: string,
  bodyMd: string
): Promise<UpsertArtifactResult> {
  // Validate that body_md contains substantive content before storing (0137)
  const contentValidation = hasSubstantiveContent(bodyMd, title)
  if (!contentValidation.valid) {
    const msg = `Artifact "${title}" validation failed: ${contentValidation.reason || 'insufficient content'}. Skipping storage to prevent blank/placeholder artifacts.`
    console.warn('[agent-runs]', msg)
    return { ok: false, error: msg }
  }
  // Extract artifact type from title and get ticket's display_id for canonical matching (0121)
  const artifactType = extractArtifactTypeFromTitle(title)
  let artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }> = []
  
  if (!artifactType) {
    // If we can't extract artifact type, fall back to exact title matching
    const { data: existingArtifacts, error: selectErr } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, body_md, created_at')
      .eq('ticket_pk', ticketPk)
      .eq('agent_type', agentType)
      .eq('title', title)
      .order('created_at', { ascending: false })
    if (selectErr) {
      const msg = `agent_artifacts select: ${selectErr.message}`
      console.error('[agent-runs]', msg)
      return { ok: false, error: msg }
    }
    artifacts = (existingArtifacts || []) as Array<{
      artifact_id: string
      body_md?: string
      created_at: string
    }>
  } else {
    // Get ticket's display_id for canonical title normalization
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('display_id')
      .eq('pk', ticketPk)
      .maybeSingle()
    
    if (ticketErr) {
      console.warn('[agent-runs] Failed to fetch ticket display_id, using title as-is:', ticketErr.message)
    }
    
    const displayId = (ticket as { display_id?: string })?.display_id || title.match(/\d+/)?.[0] || ''
    const canonicalTitle = createCanonicalTitle(artifactType, displayId)
    
    // Find existing artifacts by canonical identifier (ticket_pk + agent_type + artifact_type)
    // instead of exact title match to handle different title formats (0121)
    const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
      supabase,
      ticketPk,
      agentType as 'implementation' | 'qa',
      artifactType
    )
    
    if (findError) {
      const msg = `agent_artifacts select: ${findError}`
      console.error('[agent-runs]', msg)
      return { ok: false, error: msg }
    }
    
    artifacts = (existingArtifacts || []) as Array<{
      artifact_id: string
      body_md?: string
      created_at: string
    }>
    
    // Use canonical title for consistency
    title = canonicalTitle
  }

  // Identify empty/placeholder artifacts (body is empty or very short)
  const emptyArtifactIds: string[] = []
  for (const artifact of artifacts) {
    const currentBody = (artifact.body_md || '').trim()
    // Consider empty or very short (< 30 chars) as placeholder
    if (currentBody.length === 0 || currentBody.length < 30) {
      emptyArtifactIds.push(artifact.artifact_id)
    }
  }

  // Delete all empty/placeholder artifacts to clean up duplicates
  if (emptyArtifactIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('agent_artifacts')
      .delete()
      .in('artifact_id', emptyArtifactIds)
    if (deleteErr) {
      // Log but don't fail - we can still proceed with update/insert
      console.warn('[agent-runs] Failed to delete empty artifacts:', deleteErr.message)
    }
  }

  // Determine which artifact to update (prefer the most recent one with content)
  const artifactsWithContent = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
  let targetArtifactId: string | null = null
  if (artifactsWithContent.length > 0) {
    targetArtifactId = artifactsWithContent[0].artifact_id
  } else if (artifacts.length > 0) {
    // If all were empty and we deleted them, check if any remain (race condition)
    const remaining = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
    if (remaining.length > 0) {
      targetArtifactId = remaining[0].artifact_id
    }
  }

  if (targetArtifactId) {
    // Update the target artifact with canonical title and new body (0121)
    const { error: updateErr } = await supabase
      .from('agent_artifacts')
      .update({ title, body_md: bodyMd } as Record<string, unknown>)
      .eq('artifact_id', targetArtifactId)
    if (updateErr) {
      const msg = `agent_artifacts update: ${updateErr.message}`
      console.error('[agent-runs]', msg)
      return { ok: false, error: msg }
    }
    return { ok: true }
  }

  // No existing artifact found (or all were deleted), insert new one with canonical title (0121)
  const { error: insertErr } = await supabase.from('agent_artifacts').insert({
    ticket_pk: ticketPk,
    repo_full_name: repoFullName,
    agent_type: agentType,
    title, // Use canonical title if available
    body_md: bodyMd,
  } as Record<string, unknown>)
  if (insertErr) {
    // Handle race condition: if duplicate key error, try to find and update the existing artifact
    if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
      const { data: existingArtifact, error: findErr } = await supabase
        .from('agent_artifacts')
        .select('artifact_id')
        .eq('ticket_pk', ticketPk)
        .eq('agent_type', agentType)
        .eq('title', title)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!findErr && existingArtifact?.artifact_id) {
        const { error: updateErr } = await supabase
          .from('agent_artifacts')
          .update({ body_md: bodyMd } as Record<string, unknown>)
          .eq('artifact_id', existingArtifact.artifact_id)

        if (!updateErr) {
          return { ok: true }
        }
      }
    }

    const msg = `agent_artifacts insert: ${insertErr.message}`
    console.error('[agent-runs]', msg)
    return { ok: false, error: msg }
  }
  return { ok: true }
}
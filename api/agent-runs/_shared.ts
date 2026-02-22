import type { IncomingMessage, ServerResponse } from 'http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  findArtifactsByCanonicalId,
} from '../artifacts/_shared.js'
import { hasSubstantiveContent } from '../artifacts/_validation.js'

export type AgentType = 'implementation' | 'qa'

/**
 * Reads and parses JSON body from an HTTP request.
 * Returns empty object if body is empty.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/**
 * Sends a JSON response with the specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Validates HTTP method and sends 405 Method Not Allowed if invalid.
 * Returns true if method is valid, false if 405 was sent.
 */
export function validateMethod(
  req: IncomingMessage,
  res: ServerResponse,
  allowedMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
): boolean {
  if (req.method !== allowedMethod) {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return false
  }
  return true
}

/** Get query parameter from request URL. Returns null if not found or URL is invalid. */
export function getQueryParam(req: IncomingMessage, name: string): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const v = url.searchParams.get(name)
    return v ? v : null
  } catch {
    return null
  }
}

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error('Supabase server env is missing (SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY).')
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

/** Helper: Find existing artifacts by exact title match (fallback when artifact type can't be extracted). */
async function findArtifactsByExactTitle(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  title: string
): Promise<{ artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }>; error: string | null }> {
  const { data: existingArtifacts, error: selectErr } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, body_md, created_at')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', agentType)
    .eq('title', title)
    .order('created_at', { ascending: false })
  
  if (selectErr) {
    return { artifacts: [], error: `agent_artifacts select: ${selectErr.message}` }
  }
  
  return { artifacts: (existingArtifacts || []) as Array<{ artifact_id: string; body_md?: string; created_at: string }>, error: null }
}

/** Helper: Get canonical title and find existing artifacts by canonical ID. */
async function findArtifactsByCanonical(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  artifactType: string,
  originalTitle: string
): Promise<{ artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }>; canonicalTitle: string; error: string | null }> {
  // Get ticket's display_id for canonical title normalization
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('display_id')
    .eq('pk', ticketPk)
    .maybeSingle()
  
  if (ticketErr) {
    console.warn('[agent-runs] Failed to fetch ticket display_id, using title as-is:', ticketErr.message)
  }
  
  const displayId = (ticket as { display_id?: string })?.display_id || originalTitle.match(/\d+/)?.[0] || ''
  const canonicalTitle = createCanonicalTitle(artifactType, displayId)
  
  // Find existing artifacts by canonical identifier
  const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    agentType as 'implementation' | 'qa',
    artifactType
  )
  
  if (findError) {
    return { artifacts: [], canonicalTitle, error: `agent_artifacts select: ${findError}` }
  }
  
  return { artifacts: (existingArtifacts || []) as Array<{ artifact_id: string; body_md?: string; created_at: string }>, canonicalTitle, error: null }
}

/** Helper: Identify and delete empty/placeholder artifacts. */
async function deleteEmptyArtifacts(
  supabase: SupabaseClient<any, 'public', any>,
  artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }>,
  title: string
): Promise<string[]> {
  const emptyArtifactIds: string[] = []
  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const currentValidation = hasSubstantiveContent(currentBody, title)
    if (!currentValidation.valid) {
      emptyArtifactIds.push(artifact.artifact_id)
    }
  }

  if (emptyArtifactIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('agent_artifacts')
      .delete()
      .in('artifact_id', emptyArtifactIds)
    if (deleteErr) {
      console.warn('[agent-runs] Failed to delete empty artifacts:', deleteErr.message)
    }
  }

  return emptyArtifactIds
}

/** Helper: Find target artifact ID to update, or null if we should insert. */
function findTargetArtifactId(
  artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }>,
  emptyArtifactIds: string[]
): string | null {
  const artifactsWithContent = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
  if (artifactsWithContent.length > 0) {
    return artifactsWithContent[0].artifact_id
  }
  return null
}

/** Helper: Update an existing artifact. */
async function updateExistingArtifact(
  supabase: SupabaseClient<any, 'public', any>,
  artifactId: string,
  canonicalTitle: string,
  bodyMd: string
): Promise<UpsertArtifactResult> {
  const { error: updateErr } = await supabase
    .from('agent_artifacts')
    .update({ title: canonicalTitle, body_md: bodyMd } as Record<string, unknown>)
    .eq('artifact_id', artifactId)
  
  if (updateErr) {
    const msg = `agent_artifacts update: ${updateErr.message}`
    console.error('[agent-runs]', msg)
    return { ok: false, error: msg }
  }
  
  return { ok: true }
}

/** Helper: Insert a new artifact, handling duplicate key errors. */
async function insertNewArtifact(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  repoFullName: string,
  agentType: string,
  canonicalTitle: string,
  bodyMd: string
): Promise<UpsertArtifactResult> {
  const { error: insertErr } = await supabase.from('agent_artifacts').insert({
    ticket_pk: ticketPk,
    repo_full_name: repoFullName,
    agent_type: agentType,
    title: canonicalTitle,
    body_md: bodyMd,
  } as Record<string, unknown>)

  if (!insertErr) {
    return { ok: true }
  }

  // Handle race condition: duplicate key error
  if (insertErr.message.includes('duplicate') || insertErr.code === '23505') {
    const { data: existingArtifact, error: findErr } = await supabase
      .from('agent_artifacts')
      .select('artifact_id')
      .eq('ticket_pk', ticketPk)
      .eq('agent_type', agentType)
      .eq('title', canonicalTitle)
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
  // Validate content once at the start (0137)
  const contentValidation = hasSubstantiveContent(bodyMd, title)
  if (!contentValidation.valid) {
    const msg = `Artifact "${title}" validation failed: ${contentValidation.reason || 'insufficient content'}. Skipping storage to prevent blank/placeholder artifacts.`
    console.warn('[agent-runs]', msg)
    return { ok: false, error: msg }
  }

  // Extract artifact type and find existing artifacts
  const artifactType = extractArtifactTypeFromTitle(title)
  let artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string }> = []
  let canonicalTitle = title

  if (!artifactType) {
    // Fall back to exact title matching
    const result = await findArtifactsByExactTitle(supabase, ticketPk, agentType, title)
    if (result.error) {
      console.error('[agent-runs]', result.error)
      return { ok: false, error: result.error }
    }
    artifacts = result.artifacts
  } else {
    // Use canonical matching
    const result = await findArtifactsByCanonical(supabase, ticketPk, agentType, artifactType, title)
    if (result.error) {
      console.error('[agent-runs]', result.error)
      return { ok: false, error: result.error }
    }
    artifacts = result.artifacts
    canonicalTitle = result.canonicalTitle
  }

  // Delete empty/placeholder artifacts
  const emptyArtifactIds = await deleteEmptyArtifacts(supabase, artifacts, canonicalTitle)

  // Determine target artifact to update, or insert new one
  const targetArtifactId = findTargetArtifactId(artifacts, emptyArtifactIds)

  if (targetArtifactId) {
    return await updateExistingArtifact(supabase, targetArtifactId, canonicalTitle, bodyMd)
  }

  return await insertNewArtifact(supabase, ticketPk, repoFullName, agentType, canonicalTitle, bodyMd)
}
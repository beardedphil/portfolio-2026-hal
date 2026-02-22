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

type ArtifactRow = { artifact_id: string; body_md?: string; created_at: string }

/** Validates artifact content and returns error message if invalid. */
function validateArtifactContent(bodyMd: string, title: string): { valid: boolean; error?: string } {
  const validation = hasSubstantiveContent(bodyMd, title)
  if (!validation.valid) {
    return {
      valid: false,
      error: `Artifact "${title}" validation failed: ${validation.reason || 'insufficient content'}. Skipping storage to prevent blank/placeholder artifacts.`,
    }
  }
  return { valid: true }
}

/** Finds existing artifacts by exact title match (fallback when artifact type cannot be extracted). */
async function findArtifactsByTitle(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  title: string
): Promise<{ artifacts: ArtifactRow[]; error: string | null }> {
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
  return { artifacts: (existingArtifacts || []) as ArtifactRow[], error: null }
}

/** Gets ticket display ID for canonical title generation. */
async function getTicketDisplayId(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string
): Promise<string> {
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('display_id')
    .eq('pk', ticketPk)
    .maybeSingle()
  
  if (ticketErr) {
    console.warn('[agent-runs] Failed to fetch ticket display_id, using title as-is:', ticketErr.message)
  }
  
  return (ticket as { display_id?: string })?.display_id || ''
}

/** Finds existing artifacts by canonical identifier (preferred method). */
async function findArtifactsByCanonical(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  artifactType: string
): Promise<{ artifacts: ArtifactRow[]; canonicalTitle: string; error: string | null }> {
  const displayId = await getTicketDisplayId(supabase, ticketPk)
  const canonicalTitle = createCanonicalTitle(artifactType, displayId)
  
  const { artifacts: existingArtifacts, error: findError } = await findArtifactsByCanonicalId(
    supabase,
    ticketPk,
    agentType as 'implementation' | 'qa',
    artifactType
  )
  
  if (findError) {
    return { artifacts: [], canonicalTitle, error: `agent_artifacts select: ${findError}` }
  }
  
  return {
    artifacts: (existingArtifacts || []) as ArtifactRow[],
    canonicalTitle,
    error: null,
  }
}

/** Identifies and deletes empty/placeholder artifacts. */
async function cleanupEmptyArtifacts(
  supabase: SupabaseClient<any, 'public', any>,
  artifacts: ArtifactRow[],
  title: string
): Promise<string[]> {
  const emptyArtifactIds: string[] = []
  for (const artifact of artifacts) {
    const currentBody = artifact.body_md || ''
    const validation = hasSubstantiveContent(currentBody, title)
    if (!validation.valid) {
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

/** Determines which artifact ID to update, or null if none found. */
function findTargetArtifactId(artifacts: ArtifactRow[], emptyArtifactIds: string[]): string | null {
  const artifactsWithContent = artifacts.filter((a) => !emptyArtifactIds.includes(a.artifact_id))
  return artifactsWithContent.length > 0 ? artifactsWithContent[0].artifact_id : null
}

/** Updates an existing artifact. Assumes content is already validated. */
async function updateArtifact(
  supabase: SupabaseClient<any, 'public', any>,
  artifactId: string,
  title: string,
  bodyMd: string
): Promise<UpsertArtifactResult> {
  const { error: updateErr } = await supabase
    .from('agent_artifacts')
    .update({ title, body_md: bodyMd } as Record<string, unknown>)
    .eq('artifact_id', artifactId)
  
  if (updateErr) {
    const msg = `agent_artifacts update: ${updateErr.message}`
    console.error('[agent-runs]', msg)
    return { ok: false, error: msg }
  }
  return { ok: true }
}

/** Handles duplicate key error by finding and updating existing artifact. */
async function handleDuplicateKeyError(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  title: string,
  bodyMd: string
): Promise<UpsertArtifactResult | null> {
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
    return updateArtifact(supabase, existingArtifact.artifact_id, title, bodyMd)
  }
  return null
}

/** Inserts a new artifact, handling duplicate key errors. Assumes content is already validated. */
async function insertArtifact(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  repoFullName: string,
  agentType: string,
  title: string,
  bodyMd: string
): Promise<UpsertArtifactResult> {
  const { error: insertErr } = await supabase.from('agent_artifacts').insert({
    ticket_pk: ticketPk,
    repo_full_name: repoFullName,
    agent_type: agentType,
    title,
    body_md: bodyMd,
  } as Record<string, unknown>)
  
  if (insertErr) {
    // Handle race condition: if duplicate key error, try to find and update the existing artifact
    const isDuplicate = insertErr.message.includes('duplicate') || insertErr.code === '23505'
    if (isDuplicate) {
      const updateResult = await handleDuplicateKeyError(supabase, ticketPk, agentType, title, bodyMd)
      if (updateResult) return updateResult
    }

    const msg = `agent_artifacts insert: ${insertErr.message}`
    console.error('[agent-runs]', msg)
    return { ok: false, error: msg }
  }
  return { ok: true }
}

/** Finds existing artifacts using canonical or title matching. */
async function findExistingArtifacts(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  agentType: string,
  title: string
): Promise<{ artifacts: ArtifactRow[]; finalTitle: string; error: string | null }> {
  const artifactType = extractArtifactTypeFromTitle(title)
  
  if (!artifactType) {
    // Fall back to exact title matching
    const result = await findArtifactsByTitle(supabase, ticketPk, agentType, title)
    if (result.error) {
      return { artifacts: [], finalTitle: title, error: result.error }
    }
    return { artifacts: result.artifacts, finalTitle: title, error: null }
  }
  
  // Use canonical matching
  const result = await findArtifactsByCanonical(supabase, ticketPk, agentType, artifactType)
  if (result.error) {
    return { artifacts: [], finalTitle: title, error: result.error }
  }
  return { artifacts: result.artifacts, finalTitle: result.canonicalTitle, error: null }
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
  // Validate content upfront (single validation point)
  const initialValidation = validateArtifactContent(bodyMd, title)
  if (!initialValidation.valid) {
    console.warn('[agent-runs]', initialValidation.error)
    return { ok: false, error: initialValidation.error || 'Validation failed' }
  }

  // Find existing artifacts
  const findResult = await findExistingArtifacts(supabase, ticketPk, agentType, title)
  if (findResult.error) {
    console.error('[agent-runs]', findResult.error)
    return { ok: false, error: findResult.error }
  }

  // Clean up empty artifacts
  const emptyArtifactIds = await cleanupEmptyArtifacts(supabase, findResult.artifacts, findResult.finalTitle)

  // Determine target artifact or insert new
  const targetArtifactId = findTargetArtifactId(findResult.artifacts, emptyArtifactIds)
  
  if (targetArtifactId) {
    return updateArtifact(supabase, targetArtifactId, findResult.finalTitle, bodyMd)
  }

  return insertArtifact(supabase, ticketPk, repoFullName, agentType, findResult.finalTitle, bodyMd)
}
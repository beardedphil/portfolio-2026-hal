import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from './_shared.js'

type TicketLookupResult<T> = { data: T | null; error: unknown | null }

// `@supabase/supabase-js`'s `SupabaseClient` generic type has varied across versions.
// For API handlers we only need the structural surface area we call (`from(...)`).
type SupabaseClientLike = {
  from: (table: string) => any
}

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

async function fetchTicketByIdOrDisplayId(supabase: SupabaseClientLike, ticketId: string) {
  // Try multiple lookup strategies to handle different ticket ID formats:
  // - "581" (numeric id)
  // - "0581" (numeric id with leading zeros)
  // - "HAL-0581" (display_id format)
  // - other prefixes like "ABC-0123" (still treated as display_id)
  const tried: string[] = []

  const tryFetch = async (label: string, query: Promise<TicketLookupResult<any>>) => {
    tried.push(label)
    const result = await query
    if (!result.error && result.data) return result
    return null
  }

  // Strategy 1: by id as-is
  const byId = await tryFetch(
    `id=${ticketId}`,
    supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle() as any
  )
  if (byId) return { fetch: byId, tried }

  // Strategy 2: by display_id as-is
  const byDisplayId = await tryFetch(
    `display_id=${ticketId}`,
    supabase.from('tickets').select('*').eq('display_id', ticketId).maybeSingle() as any
  )
  if (byDisplayId) return { fetch: byDisplayId, tried }

  // Strategy 3: if looks like "HAL-0581", extract numeric part and try by id without leading zeros
  if (/^[A-Z]+-/.test(ticketId)) {
    const numericPart = ticketId.replace(/^[A-Z]+-/, '')
    const idValue = numericPart.replace(/^0+/, '') || numericPart
    if (idValue && idValue !== ticketId) {
      const byExtractedId = await tryFetch(
        `id(extracted)=${idValue}`,
        supabase.from('tickets').select('*').eq('id', idValue).maybeSingle() as any
      )
      if (byExtractedId) return { fetch: byExtractedId, tried }
    }
  }

  // Strategy 4: numeric with leading zeros -> try without leading zeros
  if (/^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
    const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
    if (withoutLeadingZeros !== ticketId) {
      const byNoZeros = await tryFetch(
        `id(no-zeros)=${withoutLeadingZeros}`,
        supabase.from('tickets').select('*').eq('id', withoutLeadingZeros).maybeSingle() as any
      )
      if (byNoZeros) return { fetch: byNoZeros, tried }
    }
  }

  // Fall back to last attempted fetch result (display_id) to return any potential error info
  return {
    fetch: (byDisplayId ??
      (await (supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle() as any))) as any,
    tried,
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests (for scripts calling from different origins)
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
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    // Use credentials from request body if provided, otherwise fall back to server environment variables.
    // Prefer privileged server keys (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY) to bypass RLS.
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch full ticket record (select all fields for forward compatibility)
    const { fetch, tried } = ticketPk
      ? {
          fetch: (await supabase.from('tickets').select('*').eq('pk', ticketPk).maybeSingle()) as any,
          tried: [`pk=${ticketPk}`],
        }
      : await fetchTicketByIdOrDisplayId(supabase, ticketId!)

    if (fetch.error) {
      json(res, 200, { success: false, error: `Supabase fetch failed: ${fetch.error.message}` })
      return
    }

    if (!fetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
        tried,
      })
      return
    }

    const ticket = fetch.data
    const ticketPkValue = ticket.pk || (ticketPk ? ticketPk : undefined)

    // If we have a ticket PK, fetch artifacts
    let artifacts: any[] = []
    let artifactsError: string | null = null
    if (ticketPkValue) {
      try {
        const { data: artifactsData, error: artifactsErr } = await supabase
          .from('agent_artifacts')
          .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
          .eq('ticket_pk', ticketPkValue)
          .order('created_at', { ascending: false })

        if (artifactsErr) {
          artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
        } else {
          artifacts = artifactsData || []
        }
      } catch (err) {
        artifactsError = err instanceof Error ? err.message : String(err)
      }
    }

    // Build artifact summary for assistant
    const artifactSummary = artifacts.map((artifact: any) => {
      const body_md = artifact.body_md || ''
      const contentLength = body_md.length
      const isBlank = !body_md || body_md.trim().length === 0 || body_md.trim().length < 30
      
      // Extract snippet (first 200 chars, word-boundary aware)
      let snippet = ''
      if (body_md) {
        const withoutHeadings = body_md.replace(/^#{1,6}\s+.*$/gm, '').trim()
        if (withoutHeadings) {
          const rawSnippet = withoutHeadings.substring(0, 200)
          const lastSpace = rawSnippet.lastIndexOf(' ')
          snippet = lastSpace > 150 && lastSpace < 200
            ? rawSnippet.substring(0, lastSpace) + '...'
            : rawSnippet.length < withoutHeadings.length
            ? rawSnippet + '...'
            : rawSnippet
        }
      }

      return {
        artifact_id: artifact.artifact_id,
        agent_type: artifact.agent_type,
        title: artifact.title,
        is_blank: isBlank,
        content_length: contentLength,
        snippet: snippet,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at || artifact.created_at,
        // Full body_md still included for detailed inspection
        body_md: artifact.body_md,
      }
    })

    // If we have a ticket PK and repo_full_name, fetch RED versions
    let redVersions: any[] = []
    let redError: string | null = null
    const repoFullName = ticket.repo_full_name
    if (ticketPkValue && repoFullName) {
      try {
        const { data: redData, error: redErr } = await supabase
          .from('hal_red_documents')
          .select('red_id, version, content_checksum, validation_status, created_at, created_by, artifact_id, hal_red_validations(result, created_at, created_by)')
          .eq('repo_full_name', repoFullName)
          .eq('ticket_pk', ticketPkValue)
          .order('version', { ascending: false })
          .order('created_at', { ascending: false })

        if (redErr) {
          redError = `Failed to fetch RED versions: ${redErr.message}`
        } else {
          redVersions = (redData || []).map((r: any) => {
            const v = Array.isArray(r.hal_red_validations) ? r.hal_red_validations[0] : null
            const effective = v?.result === 'valid' ? 'valid' : v?.result === 'invalid' ? 'invalid' : 'pending'
            return { ...r, effective_validation_status: effective, validation: v || null }
          })
        }
      } catch (err) {
        redError = err instanceof Error ? err.message : String(err)
      }
    }

    // Return full ticket record with artifacts and RED versions
    // Forward-compatible: return all ticket fields, not just specific ones
    json(res, 200, {
      success: true,
      ticket: ticket, // Full ticket record (all fields)
      artifacts: artifacts, // Array of artifacts (full)
      artifact_summary: artifactSummary, // Summarized artifacts for assistant
      ...(artifactsError ? { artifacts_error: artifactsError } : {}), // Include error if artifacts fetch failed
      red_versions: redVersions, // Array of RED versions (version, status, checksum, timestamps)
      ...(redError ? { red_error: redError } : {}), // Include error if RED fetch failed
      // Backward compatibility: also include body_md at top level
      body_md: ticket.body_md || '',
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

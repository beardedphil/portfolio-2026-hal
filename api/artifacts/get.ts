import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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
 * Determines if an artifact is blank (contains only placeholders, headings, or minimal content).
 */
export function isArtifactBlank(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }

  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*+]\s+.*$/gm, '')
    .replace(/^\d+\.\s+.*$/gm, '')
    .trim()

  if (withoutHeadings.length === 0 || withoutHeadings.length < 30) {
    return true
  }

  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m,
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return true
    }
  }

  return false
}

/**
 * Extracts a snippet from body_md (first ~200 characters, removing headings).
 */
export function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  const withoutHeadings = body_md.replace(/^#{1,6}\s+.*$/gm, '').trim()
  if (withoutHeadings.length === 0) {
    return ''
  }

  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  if (lastSpace > 150 && lastSpace < 200) {
    return snippet.substring(0, lastSpace) + '...'
  }

  return snippet.length < withoutHeadings.length ? snippet + '...' : snippet
}

/**
 * Gets Supabase credentials from request body or environment variables.
 */
function getSupabaseCredentials(body: {
  supabaseUrl?: string
  supabaseAnonKey?: string
}): { supabaseUrl: string; supabaseAnonKey: string } | null {
  const supabaseUrl =
    (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return { supabaseUrl, supabaseAnonKey }
}

/**
 * Looks up ticket PK from ticket ID with retry logic.
 * Returns { pk: string } on success, { error: string } on failure.
 */
async function lookupTicketPk(
  supabase: ReturnType<typeof createClient>,
  ticketId: string
): Promise<{ pk: string } | { error: string }> {
  const ticketNumber = parseInt(ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.` }
  }

  let ticketLookupError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100))
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk')
      .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
      .maybeSingle()

    if (!ticketError && ticket?.pk) {
      return { pk: ticket.pk }
    }

    if (ticketError) {
      ticketLookupError = ticketError
    }
  }

  return {
    error: `Ticket ${ticketId} not found in Supabase${ticketLookupError ? `: ${ticketLookupError.message}` : ''}.`,
  }
}

/**
 * Fetches artifacts for a ticket with retry logic.
 */
async function fetchArtifacts(
  supabase: ReturnType<typeof createClient>,
  ticketPk: string
): Promise<{ data: any[] | null; error: any }> {
  const maxRetries = 3
  const retryDelay = 1000

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt))
    }

    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: true })
      .order('artifact_id', { ascending: true })

    if (!error && data !== null) {
      return { data, error: null }
    }

    if (error) {
      const isRetryableError =
        error.message?.includes('timeout') ||
        error.message?.includes('network') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT') ||
        error.code === 'PGRST116'

      if (!isRetryableError || attempt === maxRetries - 1) {
        return { data: null, error }
      }
    }
  }

  return { data: null, error: new Error('Failed to fetch artifacts after retries') }
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
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      summary?: boolean
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    const credentials = getSupabaseCredentials(body)
    if (!credentials) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(credentials.supabaseUrl, credentials.supabaseAnonKey)

    // If ticketId provided, look up ticket to get pk
    let finalTicketPk = ticketPk
    if (!finalTicketPk && ticketId) {
      const lookupResult = await lookupTicketPk(supabase, ticketId)
      if ('error' in lookupResult) {
        json(res, 200, {
          success: false,
          error: lookupResult.error,
          artifacts: [],
        })
        return
      }
      finalTicketPk = lookupResult.pk
    }

    if (!finalTicketPk) {
      json(res, 400, {
        success: false,
        error: 'Could not determine ticket PK.',
        artifacts: [],
      })
      return
    }

    // Fetch all artifacts for this ticket with retry logic (0196)
    // Order by created_at ascending (oldest first) with secondary sort by artifact_id for deterministic ordering (0147)
    const { data: artifacts, error: artifactsError } = await fetchArtifacts(supabase, finalTicketPk)

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts after 3 attempts: ${artifactsError.message}`,
        artifacts: [],
      })
      return
    }

    const artifactsList = (artifacts || []) as Array<{
      artifact_id: string
      ticket_pk: string
      repo_full_name: string
      agent_type: string
      title: string
      body_md?: string
      created_at: string
      updated_at?: string
    }>

    // If summary mode is requested, return summarized data
    if (body.summary === true) {
      const summarized = artifactsList.map((artifact) => {
        const body_md = artifact.body_md || ''
        return {
          artifact_id: artifact.artifact_id,
          agent_type: artifact.agent_type,
          title: artifact.title,
          is_blank: isArtifactBlank(body_md, artifact.title || ''),
          content_length: body_md.length,
          snippet: extractSnippet(body_md),
          created_at: artifact.created_at,
          updated_at: artifact.updated_at || artifact.created_at,
        }
      })

      const blankCount = summarized.filter((a) => a.is_blank).length

      json(res, 200, {
        success: true,
        artifacts: summarized,
        summary: {
          total: summarized.length,
          blank: blankCount,
          populated: summarized.length - blankCount,
        },
      })
      return
    }

    json(res, 200, {
      success: true,
      artifacts: artifactsList,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      artifacts: [],
    })
  }
}

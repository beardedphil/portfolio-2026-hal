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
 * Determines if an artifact body is considered blank.
 * An artifact is blank if it:
 * - Is null, undefined, or empty
 * - Contains only headings, list items, or very short content (< 30 chars)
 * - Matches placeholder patterns (TODO, TBD, etc.)
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
    /^#\s+[^\n]+\n*$/m, // Only heading, no content
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i, // Heading followed by placeholder
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i, // Starts with placeholder
  ]

  // Check placeholder patterns only if content is short (to avoid false positives on substantial content)
  if (withoutHeadings.length < 100) {
    for (const pattern of placeholderPatterns) {
      if (pattern.test(body_md)) {
        return true
      }
    }
  }

  return false
}

/**
 * Extracts a snippet from artifact body markdown.
 * Removes headings and returns up to 200 characters, truncating at word boundaries when possible.
 */
export function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  const withoutHeadings = body_md.replace(/^#{1,6}\s+.*$/gm, '').trim()
  if (withoutHeadings.length === 0) {
    return ''
  }

  if (withoutHeadings.length <= 200) {
    return withoutHeadings
  }

  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  
  // If we can truncate at a word boundary between 150-200, do so
  // But ensure total length (with ellipsis) doesn't exceed 200
  if (lastSpace > 150 && lastSpace < 200) {
    const maxLength = 197 // Leave room for '...'
    if (lastSpace <= maxLength) {
      return snippet.substring(0, lastSpace) + '...'
    }
    // If truncating at space would exceed 200, just truncate at 197
    return snippet.substring(0, maxLength) + '...'
  }

  // Otherwise, truncate at 197 chars to leave room for ellipsis
  return snippet.substring(0, 197) + '...'
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

    // Use credentials from request body if provided, otherwise fall back to server environment variables
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

    // If ticketId provided, look up ticket to get pk
    let finalTicketPk = ticketPk
    if (!finalTicketPk && ticketId) {
      const ticketNumber = parseInt(ticketId, 10)
      if (!Number.isFinite(ticketNumber)) {
        json(res, 400, {
          success: false,
          error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
        })
        return
      }

      // Retry logic for ticket lookup (up to 3 attempts with exponential backoff)
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
          finalTicketPk = ticket.pk
          ticketLookupError = null
          break
        }
        
        if (ticketError) {
          ticketLookupError = ticketError
        }
      }

      if (ticketLookupError || !finalTicketPk) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId} not found in Supabase${ticketLookupError ? `: ${ticketLookupError.message}` : ''}.`,
          artifacts: [],
        })
        return
      }
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
    let artifacts: any[] | null = null
    let artifactsError: any = null
    const maxRetries = 3
    const retryDelay = 1000 // 1 second
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt))
      }
      
      const { data, error } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
        .eq('ticket_pk', finalTicketPk)
        .order('created_at', { ascending: true })
        .order('artifact_id', { ascending: true })

      if (!error && data !== null) {
        artifacts = data
        artifactsError = null
        break
      }
      
      if (error) {
        artifactsError = error
        
        // Only retry on network/timeout errors, not validation errors
        const isRetryableError = 
          error.message?.includes('timeout') ||
          error.message?.includes('network') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ETIMEDOUT') ||
          error.code === 'PGRST116' // PostgREST connection error
        
        if (!isRetryableError || attempt === maxRetries - 1) {
          break
        }
      }
    }

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts after ${maxRetries} attempts: ${artifactsError.message}`,
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
    const summaryMode = body.summary === true
    if (summaryMode) {

      const summarized = artifactsList.map((artifact: any) => {
        const body_md = artifact.body_md || ''
        const isBlank = isArtifactBlank(body_md, artifact.title || '')
        const snippet = extractSnippet(body_md)
        const contentLength = body_md.length

        return {
          artifact_id: artifact.artifact_id,
          agent_type: artifact.agent_type,
          title: artifact.title,
          is_blank: isBlank,
          content_length: contentLength,
          snippet: snippet,
          created_at: artifact.created_at,
          updated_at: artifact.updated_at || artifact.created_at,
        }
      })

      const blankCount = summarized.filter((a: any) => a.is_blank).length
      const populatedCount = summarized.length - blankCount

      json(res, 200, {
        success: true,
        artifacts: summarized,
        summary: {
          total: summarized.length,
          blank: blankCount,
          populated: populatedCount,
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

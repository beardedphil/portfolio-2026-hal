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

      // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk')
        .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
        .maybeSingle()

      if (ticketError || !ticket) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId} not found in Supabase.`,
          artifacts: [],
        })
        return
      }

      finalTicketPk = ticket.pk
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
    let artifacts: any[] = []
    let artifactsError: any = null
    const maxRetries = 3
    const retryDelay = 1000 // 1 second
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { data, error } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
        .eq('ticket_pk', finalTicketPk)
        .order('created_at', { ascending: true })
        .order('artifact_id', { ascending: true })
      
      if (!error) {
        artifacts = data || []
        artifactsError = null
        break
      }
      
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
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)))
    }

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts after ${maxRetries} attempts: ${artifactsError.message}`,
        artifacts: [],
        retry_count: maxRetries,
      })
      return
    }

    const artifactsList = artifacts || []

    // If summary mode is requested, return summarized data
    const summaryMode = body.summary === true
    if (summaryMode) {
      // Helper function to determine if artifact is blank
      const isArtifactBlank = (body_md: string | null | undefined, title: string): boolean => {
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

      // Helper function to extract snippet
      const extractSnippet = (body_md: string | null | undefined): string => {
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

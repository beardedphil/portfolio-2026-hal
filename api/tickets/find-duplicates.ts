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
 * Calculate similarity between two strings using a simple word-based approach.
 * Returns a score between 0 and 1, where 1 is identical.
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, ' ')
  const words1 = new Set(normalize(str1).split(/\s+/).filter(Boolean))
  const words2 = new Set(normalize(str2).split(/\s+/).filter(Boolean))
  
  if (words1.size === 0 && words2.size === 0) return 1
  if (words1.size === 0 || words2.size === 0) return 0
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

/**
 * Extract the actual title from a ticket title (removes display ID prefix like "HAL-0123 — ").
 */
function extractTitle(title: string): string {
  const match = title.match(/^[A-Z0-9-]+\s*—\s*(.+)$/)
  return match ? match[1] : title
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
      title?: string
      bodyText?: string
      repoFullName?: string
      excludeTicketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const bodyText = typeof body.bodyText === 'string' ? body.bodyText.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined
    const excludeTicketPk = typeof body.excludeTicketPk === 'string' ? body.excludeTicketPk.trim() : undefined

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

    if (!title || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'title and Supabase credentials are required.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all non-archived tickets (all columns except archived)
    // Non-archived columns: col-unassigned, col-todo, col-doing, col-qa, col-human-in-the-loop, col-process-review, col-done, col-wont-implement
    const nonArchivedColumns = [
      'col-unassigned',
      'col-todo',
      'col-doing',
      'col-qa',
      'col-human-in-the-loop',
      'col-process-review',
      'col-done',
      'col-wont-implement',
    ]

    let query = supabase
      .from('tickets')
      .select('pk, id, display_id, title, body_md')
      .in('kanban_column_id', nonArchivedColumns)

    // Filter by repo if provided
    if (repoFullName) {
      query = query.eq('repo_full_name', repoFullName)
    }

    // Exclude the source ticket if provided
    if (excludeTicketPk) {
      query = query.neq('pk', excludeTicketPk)
    }

    const { data: tickets, error } = await query

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch tickets: ${error.message}`,
        duplicates: [],
      })
      return
    }

    if (!tickets || tickets.length === 0) {
      json(res, 200, {
        success: true,
        duplicates: [],
      })
      return
    }

    // Calculate similarity scores for each ticket
    const normalizedTitle = extractTitle(title)
    const duplicates: Array<{ ticketId: string; displayId: string; title: string; similarity: number }> = []

    for (const ticket of tickets) {
      const ticketTitle = extractTitle(ticket.title || '')
      const titleSimilarity = calculateSimilarity(normalizedTitle, ticketTitle)
      
      // Consider tickets with >0.3 similarity as potential duplicates
      // This threshold balances catching duplicates without too many false positives
      if (titleSimilarity > 0.3) {
        duplicates.push({
          ticketId: ticket.id || ticket.pk,
          displayId: ticket.display_id || ticket.id || ticket.pk,
          title: ticket.title || '',
          similarity: titleSimilarity,
        })
      }
    }

    // Sort by similarity (highest first) and limit to top 10
    duplicates.sort((a, b) => b.similarity - a.similarity)
    const topDuplicates = duplicates.slice(0, 10)

    json(res, 200, {
      success: true,
      duplicates: topDuplicates,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duplicates: [],
    })
  }
}

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { performPeerReview, type PeerReviewResult } from '../_lib/peer-review'

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

export { type PeerReviewResult }

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
      bodyMd?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const bodyMd = typeof body.bodyMd === 'string' ? body.bodyMd : undefined
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

    // If bodyMd is provided, use it directly; otherwise fetch from Supabase
    let ticketBodyMd: string | undefined = bodyMd

    if (!ticketBodyMd && (ticketId || ticketPk)) {
      if (!supabaseUrl || !supabaseAnonKey) {
        json(res, 400, {
          success: false,
          error: 'Supabase credentials required when fetching ticket (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
        })
        return
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      // Try multiple lookup strategies (same as /api/tickets/get)
      let ticketFetch: any = null

      if (ticketPk) {
        ticketFetch = await supabase.from('tickets').select('body_md').eq('pk', ticketPk).maybeSingle()
      } else if (ticketId) {
        // Strategy 1: Try by id field as-is
        ticketFetch = await supabase.from('tickets').select('body_md').eq('id', ticketId).maybeSingle()

        // Strategy 2: If not found, try by display_id
        if (ticketFetch.error || !ticketFetch.data) {
          ticketFetch = await supabase.from('tickets').select('body_md').eq('display_id', ticketId).maybeSingle()
        }

        // Strategy 3: If ticketId looks like display_id, extract numeric part
        if ((ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
          const numericPart = ticketId.replace(/^[A-Z]+-/, '')
          const idValue = numericPart.replace(/^0+/, '') || numericPart
          if (idValue !== ticketId) {
            ticketFetch = await supabase.from('tickets').select('body_md').eq('id', idValue).maybeSingle()
          }
        }

        // Strategy 4: If ticketId is numeric with leading zeros, try without leading zeros
        if ((ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
          const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
          if (withoutLeadingZeros !== ticketId) {
            ticketFetch = await supabase.from('tickets').select('body_md').eq('id', withoutLeadingZeros).maybeSingle()
          }
        }
      }

      if (ticketFetch.error) {
        json(res, 200, {
          success: false,
          error: `Supabase fetch failed: ${ticketFetch.error.message}`,
        })
        return
      }

      if (!ticketFetch.data) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId || ticketPk} not found.`,
        })
        return
      }

      ticketBodyMd = ticketFetch.data.body_md || ''
    }

    if (!ticketBodyMd) {
      json(res, 400, {
        success: false,
        error: 'Ticket body_md is required (provide bodyMd in request body, or ticketId/ticketPk to fetch from Supabase).',
      })
      return
    }

    // Perform peer review
    const reviewResult = performPeerReview(ticketBodyMd)

    json(res, 200, {
      success: true,
      ...reviewResult,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      pass: false,
      issues: [],
      checklistResults: {
        goal: false,
        deliverable: false,
        acceptanceCriteria: false,
        constraintsNonGoals: false,
        noPlaceholders: false,
        properHeadings: false,
      },
    })
  }
}

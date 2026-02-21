/**
 * API endpoint to get ranked artifacts with relevance scores for Context Bundle selection.
 * Returns deterministic ranking based on keyword/tag/path overlap, recency, and pinned boosts.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { selectArtifacts, type ArtifactCandidate, type ScoringOptions } from './_scoring.js'
import { distillArtifact } from './_distill.js'

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
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
      query?: string
      role?: string
      maxArtifacts?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const maxArtifacts = typeof body.maxArtifacts === 'number' && body.maxArtifacts > 0 ? body.maxArtifacts : 10

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Resolve ticketPk if we only have ticketId
    let resolvedTicketPk: string | undefined = ticketPk
    if (!resolvedTicketPk && ticketId) {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch ticket: ${ticketError.message}`,
        })
      }

      if (!ticket) {
        return json(res, 404, {
          success: false,
          error: `Ticket ${ticketId} not found.`,
        })
      }

      resolvedTicketPk = ticket.pk
    }

    if (!resolvedTicketPk) {
      return json(res, 400, {
        success: false,
        error: 'Could not resolve ticket_pk. Please provide ticketPk or ticketId.',
      })
    }

    // Fetch all artifacts for this ticket
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, title, agent_type, created_at, body_md')
      .eq('ticket_pk', resolvedTicketPk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
      })
    }

    if (!artifacts || artifacts.length === 0) {
      return json(res, 200, {
        success: true,
        artifacts: [],
        selected_count: 0,
        total_count: 0,
      })
    }

    // Fetch pinned artifacts for this ticket and role
    const pinnedQuery = supabase
      .from('context_bundle_pins')
      .select('artifact_id')
      .eq('ticket_pk', resolvedTicketPk)

    // If role is specified, get pins for that role OR null role (all roles)
    if (role) {
      pinnedQuery.or(`role.eq.${role},role.is.null`)
    } else {
      pinnedQuery.is('role', null)
    }

    const { data: pins, error: pinsError } = await pinnedQuery

    if (pinsError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch pins: ${pinsError.message}`,
      })
    }

    const pinnedArtifactIds = new Set((pins || []).map((p) => p.artifact_id))

    // Build candidates with pinned status
    const candidates: ArtifactCandidate[] = artifacts.map((artifact) => ({
      artifact_id: artifact.artifact_id,
      title: artifact.title || 'Untitled',
      agent_type: artifact.agent_type || 'unknown',
      created_at: artifact.created_at || '',
      title_lower: (artifact.title || '').toLowerCase(),
      body_md: artifact.body_md || undefined,
      pinned: pinnedArtifactIds.has(artifact.artifact_id),
    }))

    // Score and select artifacts
    const scoringOptions: ScoringOptions = {
      query,
      role,
      maxArtifacts,
    }

    const scored = selectArtifacts(candidates, scoringOptions)

    return json(res, 200, {
      success: true,
      artifacts: scored,
      selected_count: scored.filter((a) => a.selected).length,
      total_count: scored.length,
    })
  } catch (err) {
    console.error('Error in rank artifacts handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

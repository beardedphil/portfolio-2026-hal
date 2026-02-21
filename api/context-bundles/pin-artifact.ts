/**
 * API endpoint to pin/unpin an artifact for Context Bundle selection.
 * Pinned artifacts get a boost in relevance scoring and are always included.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { getSession } from '../_lib/github/session.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
      artifactId?: string
      role?: string | null
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() || undefined : undefined
    const role = body.role === null ? null : typeof body.role === 'string' ? body.role.trim() || null : null

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!artifactId) {
      return json(res, 400, {
        success: false,
        error: 'artifactId is required.',
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

    // Verify artifact exists and belongs to this ticket
    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk')
      .eq('artifact_id', artifactId)
      .eq('ticket_pk', resolvedTicketPk)
      .maybeSingle()

    if (artifactError) {
      return json(res, 500, {
        success: false,
        error: `Failed to verify artifact: ${artifactError.message}`,
      })
    }

    if (!artifact) {
      return json(res, 404, {
        success: false,
        error: `Artifact ${artifactId} not found for this ticket.`,
      })
    }

    // Get user identifier from session (if available)
    let createdBy: string | undefined = 'system'
    try {
      const session = await getSession(req, res)
      if (session.github?.user?.login) {
        createdBy = `user:${session.github.user.login}`
      }
    } catch {
      // Session not available, use default
    }

    if (req.method === 'POST') {
      // Pin artifact
      const { data: pin, error: pinError } = await supabase
        .from('context_bundle_pins')
        .insert({
          ticket_pk: resolvedTicketPk,
          artifact_id: artifactId,
          role,
          created_by: createdBy,
        })
        .select()
        .single()

      if (pinError) {
        // Check if it's a unique constraint violation (already pinned)
        if (pinError.code === '23505') {
          return json(res, 200, {
            success: true,
            message: 'Artifact already pinned',
            pinned: true,
          })
        }
        return json(res, 500, {
          success: false,
          error: `Failed to pin artifact: ${pinError.message}`,
        })
      }

      return json(res, 200, {
        success: true,
        message: 'Artifact pinned successfully',
        pinned: true,
        pin_id: pin.pin_id,
      })
    } else if (req.method === 'DELETE') {
      // Unpin artifact
      const deleteQuery = supabase
        .from('context_bundle_pins')
        .delete()
        .eq('ticket_pk', resolvedTicketPk)
        .eq('artifact_id', artifactId)

      // If role is specified, only delete pin for that role; otherwise delete all pins for this artifact
      if (role !== null) {
        deleteQuery.eq('role', role)
      }

      const { error: deleteError } = await deleteQuery

      if (deleteError) {
        return json(res, 500, {
          success: false,
          error: `Failed to unpin artifact: ${deleteError.message}`,
        })
      }

      return json(res, 200, {
        success: true,
        message: 'Artifact unpinned successfully',
        pinned: false,
      })
    } else {
      return json(res, 405, { error: 'Method not allowed' })
    }
  } catch (err) {
    console.error('Error in pin artifact handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

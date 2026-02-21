/**
 * API endpoint to distill a single artifact or multiple artifacts.
 * Converts raw artifact content into distilled summaries with summary, hard_facts, and keywords.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { distillArtifact, distillArtifacts } from './_distill.js'

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
      artifactId?: string
      artifactIds?: string[]
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Handle single artifact distillation
    if (body.artifactId) {
      const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined

      if (!artifactId) {
        return json(res, 400, {
          success: false,
          error: 'artifactId is required for single artifact distillation.',
        })
      }

      // Fetch artifact from Supabase
      const { data: artifact, error: artifactError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, title, body_md')
        .eq('artifact_id', artifactId)
        .maybeSingle()

      if (artifactError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch artifact: ${artifactError.message}`,
        })
      }

      if (!artifact) {
        return json(res, 404, {
          success: false,
          error: `Artifact ${artifactId} not found.`,
        })
      }

      // Distill the artifact
      const result = await distillArtifact(artifact.title || 'Untitled', artifact.body_md, artifact.artifact_id)

      return json(res, 200, {
        success: result.success,
        artifact_id: artifact.artifact_id,
        distilled: result.distilled,
        error: result.error,
      })
    }

    // Handle multiple artifact distillation
    if (body.artifactIds && Array.isArray(body.artifactIds)) {
      const artifactIds = body.artifactIds
        .map((id) => (typeof id === 'string' ? id.trim() : undefined))
        .filter((id): id is string => !!id)

      if (artifactIds.length === 0) {
        return json(res, 400, {
          success: false,
          error: 'At least one artifactId is required in artifactIds array.',
        })
      }

      // Fetch artifacts from Supabase
      const { data: artifacts, error: artifactsError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, title, body_md')
        .in('artifact_id', artifactIds)

      if (artifactsError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch artifacts: ${artifactsError.message}`,
        })
      }

      if (!artifacts || artifacts.length === 0) {
        return json(res, 404, {
          success: false,
          error: 'No artifacts found for the provided artifactIds.',
        })
      }

      // Check if all requested artifacts were found
      const foundIds = new Set(artifacts.map((a) => a.artifact_id))
      const missingIds = artifactIds.filter((id) => !foundIds.has(id))
      if (missingIds.length > 0) {
        return json(res, 404, {
          success: false,
          error: `Some artifacts not found: ${missingIds.join(', ')}`,
        })
      }

      // Distill all artifacts
      const results = await distillArtifacts(artifacts)

      return json(res, 200, {
        success: true,
        results: results.map((r) => ({
          artifact_id: r.artifact_id,
          success: r.success,
          distilled: r.distilled,
          error: r.error,
        })),
      })
    }

    // Handle batch distillation by ticket
    if (body.ticketId || body.ticketPk) {
      const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
      const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined

      if (!ticketId && !ticketPk) {
        return json(res, 400, {
          success: false,
          error: 'ticketPk (preferred) or ticketId is required for ticket-based distillation.',
        })
      }

      // Resolve ticket PK if needed
      let resolvedTicketPk: string | undefined = ticketPk
      if (!resolvedTicketPk && ticketId) {
        const ticketNumber = parseInt(ticketId, 10)
        if (!Number.isFinite(ticketNumber)) {
          return json(res, 400, {
            success: false,
            error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
          })
        }

        const { data: ticket, error: ticketError } = await supabase
          .from('tickets')
          .select('pk')
          .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
          .maybeSingle()

        if (ticketError) {
          return json(res, 500, {
            success: false,
            error: `Failed to fetch ticket: ${ticketError.message}`,
          })
        }

        if (!ticket?.pk) {
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
          error: 'Could not resolve ticket PK.',
        })
      }

      // Fetch all artifacts for this ticket
      const { data: artifacts, error: artifactsError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, title, body_md')
        .eq('ticket_pk', resolvedTicketPk)
        .order('created_at', { ascending: true })

      if (artifactsError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch artifacts: ${artifactsError.message}`,
        })
      }

      if (!artifacts || artifacts.length === 0) {
        return json(res, 200, {
          success: true,
          results: [],
          message: 'No artifacts found for this ticket.',
        })
      }

      // Distill all artifacts
      const results = await distillArtifacts(artifacts)

      return json(res, 200, {
        success: true,
        results: results.map((r) => ({
          artifact_id: r.artifact_id,
          success: r.success,
          distilled: r.distilled,
          error: r.error,
        })),
      })
    }

    // No valid input provided
    return json(res, 400, {
      success: false,
      error: 'Either artifactId, artifactIds array, or ticketId/ticketPk is required.',
    })
  } catch (err) {
    console.error('Error in distill artifact handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

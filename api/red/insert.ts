/**
 * API endpoint to insert a new RED version for a ticket.
 * Enforces immutability: cannot update existing versions, only insert new ones.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { generateRedChecksum } from './_checksum.js'

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
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      redJson: unknown
      validationStatus?: 'valid' | 'invalid' | 'pending'
      createdBy?: string
      artifactId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const redJson = body.redJson
    const validationStatus = body.validationStatus || 'pending'
    const createdBy = typeof body.createdBy === 'string' ? body.createdBy.trim() || undefined : undefined
    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() || undefined : undefined

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (redJson === undefined || redJson === null) {
      json(res, 400, {
        success: false,
        error: 'redJson is required.',
      })
      return
    }

    if (!['valid', 'invalid', 'pending'].includes(validationStatus)) {
      json(res, 400, {
        success: false,
        error: 'validationStatus must be "valid", "invalid", or "pending".',
      })
      return
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // If we have ticketId but not ticketPk, fetch ticket to get ticketPk and repoFullName
    let resolvedTicketPk: string | undefined = ticketPk
    let resolvedRepoFullName: string | undefined = repoFullName

    if (!resolvedTicketPk && ticketId) {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, repo_full_name')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch ticket: ${ticketError.message}`,
        })
        return
      }

      if (!ticket) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId} not found.`,
        })
        return
      }

      resolvedTicketPk = ticket.pk
      resolvedRepoFullName = ticket.repo_full_name
    } else if (resolvedTicketPk && !resolvedRepoFullName) {
      // Fetch repo_full_name if we have ticketPk but not repoFullName
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('repo_full_name')
        .eq('pk', resolvedTicketPk)
        .maybeSingle()

      if (ticketError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch ticket: ${ticketError.message}`,
        })
        return
      }

      if (ticket) {
        resolvedRepoFullName = ticket.repo_full_name
      }
    }

    if (!resolvedTicketPk || !resolvedRepoFullName) {
      json(res, 400, {
        success: false,
        error: 'Could not resolve ticket_pk and repo_full_name. Please provide ticketPk and repoFullName, or ticketId.',
      })
      return
    }

    // Get the next version number for this ticket
    const { data: existingVersions, error: versionError } = await supabase
      .from('hal_red_documents')
      .select('version')
      .eq('repo_full_name', resolvedRepoFullName)
      .eq('ticket_pk', resolvedTicketPk)
      .order('version', { ascending: false })
      .limit(1)

    if (versionError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch existing versions: ${versionError.message}`,
      })
      return
    }

    const nextVersion = existingVersions && existingVersions.length > 0
      ? (existingVersions[0].version as number) + 1
      : 1

    // Generate deterministic checksum
    const contentChecksum = generateRedChecksum(redJson)

    // Insert new RED version
    const { data: insertedRed, error: insertError } = await supabase
      .from('hal_red_documents')
      .insert({
        repo_full_name: resolvedRepoFullName,
        ticket_pk: resolvedTicketPk,
        version: nextVersion,
        red_json: redJson,
        content_checksum: contentChecksum,
        validation_status: validationStatus,
        created_by: createdBy || null,
        artifact_id: artifactId || null,
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a unique constraint violation (version already exists)
      if (insertError.code === '23505' || insertError.message?.includes('unique constraint')) {
        json(res, 200, {
          success: false,
          error: `Version ${nextVersion} already exists for this ticket. This should not happen if versions are assigned sequentially.`,
        })
        return
      }

      json(res, 200, {
        success: false,
        error: `Failed to insert RED: ${insertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      red_document: insertedRed,
      ticket_pk: resolvedTicketPk,
      repo_full_name: resolvedRepoFullName,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

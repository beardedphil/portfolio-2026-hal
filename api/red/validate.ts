/**
 * API endpoint to validate a RED document.
 * Validates the RED JSON and updates the validation_status in the database.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { validateRed } from './_validation.js'

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
      version?: number
      redId?: string
      redJson?: unknown // Optional: if provided, validate this JSON directly instead of fetching from DB
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const version = body.version
    const redId = typeof body.redId === 'string' ? body.redId.trim() || undefined : undefined
    const redJson = body.redJson

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let redDocument: any = null
    let resolvedTicketPk: string | undefined = ticketPk
    let resolvedRepoFullName: string | undefined = repoFullName

    // If redJson is provided directly, use it; otherwise fetch from database
    if (redJson !== undefined && redJson !== null) {
      // Validate the provided JSON directly
      const validationResult = validateRed(redJson)
      const validationStatus = validationResult.pass ? 'valid' : 'invalid'

      json(res, 200, {
        success: true,
        validation: validationResult,
        validation_status: validationStatus,
      })
      return
    }

    // Otherwise, fetch RED document from database
    if (!redId && (!ticketPk && !ticketId)) {
      json(res, 400, {
        success: false,
        error: 'Either redId, (ticketPk or ticketId) with version, or redJson must be provided.',
      })
      return
    }

    // Resolve ticketPk and repoFullName if needed
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

    // Fetch RED document
    if (redId) {
      const { data, error: fetchError } = await supabase
        .from('hal_red_documents')
        .select('*')
        .eq('red_id', redId)
        .maybeSingle()

      if (fetchError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch RED: ${fetchError.message}`,
        })
        return
      }

      if (!data) {
        json(res, 200, {
          success: false,
          error: `RED document with red_id ${redId} not found.`,
        })
        return
      }

      redDocument = data
      resolvedTicketPk = data.ticket_pk
      resolvedRepoFullName = data.repo_full_name
    } else if (resolvedTicketPk && resolvedRepoFullName && version !== undefined) {
      const { data, error: fetchError } = await supabase
        .from('hal_red_documents')
        .select('*')
        .eq('repo_full_name', resolvedRepoFullName)
        .eq('ticket_pk', resolvedTicketPk)
        .eq('version', version)
        .maybeSingle()

      if (fetchError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch RED: ${fetchError.message}`,
        })
        return
      }

      if (!data) {
        json(res, 200, {
          success: false,
          error: `RED version ${version} not found for this ticket.`,
        })
        return
      }

      redDocument = data
    } else {
      json(res, 400, {
        success: false,
        error: 'Either redId, (ticketPk/ticketId with version), or redJson must be provided.',
      })
      return
    }

    // Validate the RED JSON
    const validationResult = validateRed(redDocument.red_json)
    const validationStatus = validationResult.pass ? 'valid' : 'invalid'

    // Update validation_status in database
    const { error: updateError } = await supabase
      .from('hal_red_documents')
      .update({
        validation_status: validationStatus,
      })
      .eq('red_id', redDocument.red_id)

    if (updateError) {
      json(res, 200, {
        success: false,
        error: `Validation succeeded but failed to update database: ${updateError.message}`,
        validation: validationResult,
        validation_status: validationStatus,
      })
      return
    }

    json(res, 200, {
      success: true,
      validation: validationResult,
      validation_status: validationStatus,
      red_id: redDocument.red_id,
      version: redDocument.version,
      ticket_pk: resolvedTicketPk,
      repo_full_name: resolvedRepoFullName,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

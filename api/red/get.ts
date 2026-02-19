/**
 * API endpoint to get a specific RED version or the latest valid RED for a ticket.
 * Supports fetching by version number or "latest-valid".
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'

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
      version?: number | 'latest-valid'
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const version = body.version

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (version === undefined) {
      json(res, 400, {
        success: false,
        error: 'version is required (provide a number or "latest-valid").',
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

    let redDocument: any = null
    let error: any = null

    if (version === 'latest-valid') {
      // Use the database function to get latest valid RED
      const { data, error: funcError } = await supabase.rpc('get_latest_valid_red', {
        p_repo_full_name: resolvedRepoFullName,
        p_ticket_pk: resolvedTicketPk,
      })

      if (funcError) {
        error = funcError
      } else if (data && data.length > 0) {
        redDocument = data[0]
      } else {
        json(res, 200, {
          success: false,
          error: 'No valid RED found for this ticket.',
        })
        return
      }
    } else {
      // Fetch specific version
      const { data, error: fetchError } = await supabase
        .from('hal_red_documents')
        .select('*')
        .eq('repo_full_name', resolvedRepoFullName)
        .eq('ticket_pk', resolvedTicketPk)
        .eq('version', version)
        .maybeSingle()

      if (fetchError) {
        error = fetchError
      } else if (!data) {
        json(res, 200, {
          success: false,
          error: `RED version ${version} not found for this ticket.`,
        })
        return
      } else {
        redDocument = data
      }
    }

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch RED: ${error.message}`,
      })
      return
    }

    // Fetch validation results if available
    let validationResult: any = null
    if (redDocument) {
      const { data: validation, error: validationError } = await supabase
        .from('hal_red_validation_results')
        .select('pass, failures, validated_at')
        .eq('red_id', redDocument.red_id)
        .maybeSingle()

      if (!validationError && validation) {
        validationResult = {
          pass: validation.pass,
          failures: validation.failures,
          validatedAt: validation.validated_at,
        }
      }
    }

    json(res, 200, {
      success: true,
      red_document: redDocument,
      validation_result: validationResult,
      ticket_pk: resolvedTicketPk,
      repo_full_name: resolvedRepoFullName,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

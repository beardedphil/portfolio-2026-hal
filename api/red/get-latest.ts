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
      redVersion?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = body.ticketPk
    const ticketId = body.ticketId
    const redVersion = body.redVersion || 'v0'

    if (!ticketPk && !ticketId) {
      json(res, 400, {
        success: false,
        error: 'ticketPk or ticketId is required',
      })
      return
    }

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket to get PK
    let ticketPkValue: string

    if (ticketPk) {
      ticketPkValue = ticketPk
    } else {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError || !ticket) {
        json(res, 400, {
          success: false,
          error: `Ticket not found: ${ticketId}`,
        })
        return
      }

      ticketPkValue = ticket.pk
    }

    // Fetch latest validation result
    const { data: validationResult, error: fetchError } = await supabase
      .from('red_validation_results')
      .select('*')
      .eq('ticket_pk', ticketPkValue)
      .eq('red_version', redVersion)
      .order('validated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch validation result: ${fetchError.message}`,
      })
      return
    }

    if (!validationResult) {
      json(res, 200, {
        success: true,
        validation: null,
      })
      return
    }

    json(res, 200, {
      success: true,
      validation: {
        pass: validationResult.pass,
        failures: validationResult.failures,
        validatedAt: validationResult.validated_at,
        redVersion: validationResult.red_version,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * API endpoint to validate a RED document version (Option A).
 * Creates a validation row in hal_red_validations for a specific red_id.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'

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
    json(res, 405, { success: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      redId?: string
      result?: 'valid' | 'invalid'
      createdBy?: string
      notes?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const redId = typeof body.redId === 'string' ? body.redId.trim() || undefined : undefined
    const result = typeof body.result === 'string' ? body.result.trim() : ''
    const createdBy = typeof body.createdBy === 'string' ? body.createdBy.trim() || undefined : undefined
    const notes = typeof body.notes === 'string' ? body.notes.trim() || undefined : undefined

    if (!redId) {
      json(res, 400, { success: false, error: 'redId is required.' })
      return
    }
    if (result !== 'valid' && result !== 'invalid') {
      json(res, 400, { success: false, error: 'result must be "valid" or "invalid".' })
      return
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error:
          'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Ensure the RED exists
    const { data: redRow, error: redErr } = await supabase
      .from('hal_red_documents')
      .select('red_id, repo_full_name, ticket_pk, version')
      .eq('red_id', redId)
      .maybeSingle()
    if (redErr) {
      json(res, 200, { success: false, error: `Failed to fetch RED: ${redErr.message}` })
      return
    }
    if (!redRow) {
      json(res, 200, { success: false, error: `RED ${redId} not found.` })
      return
    }

    const { data: inserted, error: insErr } = await supabase
      .from('hal_red_validations')
      .insert({
        red_id: redId,
        result,
        created_by: createdBy || null,
        notes: notes || null,
      })
      .select('validation_id, red_id, result, created_at, created_by, notes')
      .single()

    if (insErr) {
      const msg =
        insErr.code === '23505' || insErr.message?.toLowerCase().includes('unique')
          ? 'Validation already exists for this RED. Create a new RED version to re-validate.'
          : insErr.message
      json(res, 200, { success: false, error: `Failed to insert validation: ${msg}` })
      return
    }

    json(res, 200, {
      success: true,
      validation: inserted,
      red: redRow,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}


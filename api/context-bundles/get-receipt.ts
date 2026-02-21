/**
 * API endpoint to get Bundle Receipt details for a specific bundle.
 * Returns receipt with checksums, section metrics, and references.
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
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      bundleId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!bundleId) {
      return json(res, 400, {
        success: false,
        error: 'bundleId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('bundle_receipts')
      .select('*')
      .eq('bundle_id', bundleId)
      .maybeSingle()

    if (receiptError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch receipt: ${receiptError.message}`,
      })
    }

    if (!receipt) {
      return json(res, 404, {
        success: false,
        error: `Receipt not found for bundle ${bundleId}.`,
      })
    }

    // Fetch bundle info separately
    const { data: bundle, error: bundleError } = await supabase
      .from('context_bundles')
      .select('bundle_id, ticket_id, role, version, created_at')
      .eq('bundle_id', bundleId)
      .maybeSingle()

    if (bundleError) {
      // Log but don't fail - receipt is still valid without bundle info
      console.error('Failed to fetch bundle info:', bundleError)
    }

    return json(res, 200, {
      success: true,
      receipt: {
        receipt_id: receipt.receipt_id,
        bundle_id: receipt.bundle_id,
        ticket_id: receipt.ticket_id,
        role: receipt.role,
        content_checksum: receipt.content_checksum,
        bundle_checksum: receipt.bundle_checksum,
        section_metrics: receipt.section_metrics,
        total_characters: receipt.total_characters,
        red_reference: receipt.red_reference,
        integration_manifest_reference: receipt.integration_manifest_reference,
        git_ref: receipt.git_ref,
        artifact_references: receipt.artifact_references || null,
        created_at: receipt.created_at,
        bundle: bundle || null,
      },
    })
  } catch (err) {
    console.error('Error in get bundle receipt handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

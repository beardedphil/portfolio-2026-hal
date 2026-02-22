/**
 * API endpoint to run a cold-start continuity check.
 * Rebuilds a context bundle from scratch and compares checksums with the baseline.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { buildContextBundleV0 } from '../context-bundles/_builder.js'
import {
  generateContentChecksum,
  generateBundleChecksum,
} from '../context-bundles/_checksum.js'

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
      receiptId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined
    const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!bundleId && !receiptId) {
      return json(res, 400, {
        success: false,
        error: 'bundleId or receiptId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch receipt to get baseline checksums and bundle info
    let receipt: {
      receipt_id: string
      bundle_id: string
      ticket_pk: string
      ticket_id: string
      repo_full_name: string
      role: string
      content_checksum: string
      bundle_checksum: string
      red_reference: { red_id: string; version: number } | null
      integration_manifest_reference: { manifest_id: string; version: number; schema_version: string } | null
      git_ref: { pr_url?: string; pr_number?: number; base_sha?: string; head_sha?: string } | null
    } | null = null

    if (receiptId) {
      const { data: receiptData, error: receiptError } = await supabase
        .from('bundle_receipts')
        .select('*')
        .eq('receipt_id', receiptId)
        .maybeSingle()

      if (receiptError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch receipt: ${receiptError.message}`,
        })
      }

      if (!receiptData) {
        return json(res, 404, {
          success: false,
          error: `Receipt ${receiptId} not found.`,
          failureReason: 'missing_receipt',
        })
      }

      receipt = receiptData
    } else if (bundleId) {
      // Fetch receipt by bundle_id
      const { data: receiptData, error: receiptError } = await supabase
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

      if (!receiptData) {
        return json(res, 404, {
          success: false,
          error: `Receipt not found for bundle ${bundleId}.`,
          failureReason: 'missing_receipt',
        })
      }

      receipt = receiptData
    }

    if (!receipt) {
      return json(res, 404, {
        success: false,
        error: 'Receipt not found.',
        failureReason: 'missing_receipt',
      })
    }

    // Fetch bundle to get full context for rebuild
    const { data: bundle, error: bundleError } = await supabase
      .from('context_bundles')
      .select('*')
      .eq('bundle_id', receipt.bundle_id)
      .maybeSingle()

    if (bundleError || !bundle) {
      return json(res, 404, {
        success: false,
        error: `Bundle ${receipt.bundle_id} not found.`,
        failureReason: 'missing_receipt',
      })
    }

    // Rebuild bundle from scratch (cold start)
    const builderResult = await buildContextBundleV0({
      ticketPk: receipt.ticket_pk,
      ticketId: receipt.ticket_id,
      repoFullName: receipt.repo_full_name,
      role: receipt.role,
      supabaseUrl,
      supabaseAnonKey,
      selectedArtifactIds: [], // Use same artifacts as original (could be enhanced to match original)
      gitRef: receipt.git_ref || null,
    })

    if (!builderResult.success || !builderResult.bundle) {
      // Rebuild failed
      const failureReason = builderResult.error?.includes('manifest')
        ? 'missing_manifest_reference'
        : builderResult.error?.includes('artifact')
        ? 'artifact_version_mismatch'
        : 'checksum_mismatch'

      const runId = crypto.randomUUID()

      // Store FAIL result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          bundle_id: receipt.bundle_id,
          receipt_id: receipt.receipt_id,
          repo_full_name: receipt.repo_full_name,
          ticket_pk: receipt.ticket_pk,
          ticket_id: receipt.ticket_id,
          role: receipt.role,
          verdict: 'FAIL',
          baseline_content_checksum: receipt.content_checksum,
          baseline_bundle_checksum: receipt.bundle_checksum,
          rebuilt_content_checksum: null,
          rebuilt_bundle_checksum: null,
          failure_reason: failureReason,
          summary: `Rebuild failed: ${builderResult.error || 'Unknown error'}`,
          comparisons: {
            content_checksum_match: false,
            bundle_checksum_match: false,
            rebuild_succeeded: false,
            error: builderResult.error || 'Unknown error',
          },
        })

      if (insertError) {
        console.error('Failed to store continuity check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        verdict: 'FAIL',
        completedAt: new Date().toISOString(),
        failureReason,
        summary: `Rebuild failed: ${builderResult.error || 'Unknown error'}`,
        baselineChecksums: {
          content_checksum: receipt.content_checksum,
          bundle_checksum: receipt.bundle_checksum,
        },
        rebuiltChecksums: null,
        comparisons: {
          content_checksum_match: false,
          bundle_checksum_match: false,
          rebuild_succeeded: false,
        },
      })
    }

    const rebuiltBundle = builderResult.bundle

    // Generate checksums for rebuilt bundle
    const rebuiltContentChecksum = generateContentChecksum(rebuiltBundle)
    const rebuiltBundleChecksum = generateBundleChecksum(rebuiltBundle, {
      repoFullName: receipt.repo_full_name,
      ticketPk: receipt.ticket_pk,
      ticketId: receipt.ticket_id,
      role: receipt.role,
      version: bundle.version,
    })

    // Compare checksums
    const contentChecksumMatch = rebuiltContentChecksum === receipt.content_checksum
    const bundleChecksumMatch = rebuiltBundleChecksum === receipt.bundle_checksum
    const verdict = contentChecksumMatch && bundleChecksumMatch ? 'PASS' : 'FAIL'

    // Determine failure reason if FAIL
    let failureReason: string | null = null
    if (verdict === 'FAIL') {
      if (!contentChecksumMatch && !bundleChecksumMatch) {
        failureReason = 'checksum_mismatch'
      } else if (!builderResult.integrationManifestReference) {
        failureReason = 'missing_manifest_reference'
      } else {
        failureReason = 'checksum_mismatch'
      }
    }

    const runId = crypto.randomUUID()

    // Store result
    const { error: insertError } = await supabase
      .from('cold_start_continuity_checks')
      .insert({
        run_id: runId,
        bundle_id: receipt.bundle_id,
        receipt_id: receipt.receipt_id,
        repo_full_name: receipt.repo_full_name,
        ticket_pk: receipt.ticket_pk,
        ticket_id: receipt.ticket_id,
        role: receipt.role,
        verdict,
        baseline_content_checksum: receipt.content_checksum,
        baseline_bundle_checksum: receipt.bundle_checksum,
        rebuilt_content_checksum: rebuiltContentChecksum,
        rebuilt_bundle_checksum: rebuiltBundleChecksum,
        failure_reason: failureReason,
        summary: verdict === 'PASS'
          ? 'Checksums match: bundle rebuild is deterministic'
          : `Checksum mismatch: ${contentChecksumMatch ? 'bundle checksum differs' : 'content checksum differs'}`,
        comparisons: {
          content_checksum_match: contentChecksumMatch,
          bundle_checksum_match: bundleChecksumMatch,
          rebuild_succeeded: true,
          baseline_checksums: {
            content_checksum: receipt.content_checksum,
            bundle_checksum: receipt.bundle_checksum,
          },
          rebuilt_checksums: {
            content_checksum: rebuiltContentChecksum,
            bundle_checksum: rebuiltBundleChecksum,
          },
        },
      })

    if (insertError) {
      console.error('Failed to store continuity check result:', insertError)
    }

    return json(res, 200, {
      success: true,
      runId,
      verdict,
      completedAt: new Date().toISOString(),
      failureReason,
      summary: verdict === 'PASS'
        ? 'Checksums match: bundle rebuild is deterministic'
        : `Checksum mismatch: ${contentChecksumMatch ? 'bundle checksum differs' : 'content checksum differs'}`,
      baselineChecksums: {
        content_checksum: receipt.content_checksum,
        bundle_checksum: receipt.bundle_checksum,
      },
      rebuiltChecksums: {
        content_checksum: rebuiltContentChecksum,
        bundle_checksum: rebuiltBundleChecksum,
      },
      comparisons: {
        content_checksum_match: contentChecksumMatch,
        bundle_checksum_match: bundleChecksumMatch,
      },
    })
  } catch (err) {
    console.error('Error in cold-start continuity check handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

/**
 * API endpoint to run a cold-start continuity check.
 * Rebuilds a context bundle from scratch and compares it to the stored receipt.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { buildContextBundleV0 } from '../context-bundles/_builder.js'
import {
  generateContentChecksum,
  generateBundleChecksum,
} from '../context-bundles/_checksum.js'
import { randomUUID } from 'crypto'

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
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      role?: string
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

    // Generate unique run ID
    const runId = randomUUID()
    const runTimestamp = new Date().toISOString()

    // Determine which bundle to check
    let bundleId: string | undefined = body.bundleId
    let ticketPk: string | undefined = body.ticketPk
    let ticketId: string | undefined = body.ticketId
    let repoFullName: string | undefined = body.repoFullName
    let role: string | undefined = body.role

    // If bundleId provided, fetch bundle info
    if (bundleId) {
      const { data: bundle, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_id, ticket_pk, ticket_id, repo_full_name, role')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (bundleError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch bundle: ${bundleError.message}`,
        })
      }

      if (!bundle) {
        return json(res, 404, {
          success: false,
          error: `Bundle ${bundleId} not found.`,
        })
      }

      ticketPk = bundle.ticket_pk
      ticketId = bundle.ticket_id
      repoFullName = bundle.repo_full_name
      role = bundle.role
    }

    // If no bundleId, find a bundle to check
    if (!bundleId) {
      let latestBundle: { bundle_id: string; ticket_pk: string; ticket_id: string; repo_full_name: string; role: string } | null = null

      // If we have ticket info, find the latest bundle for this ticket/role
      if (ticketPk && repoFullName && role) {
        const { data, error: latestError } = await supabase
          .from('context_bundles')
          .select('bundle_id, ticket_pk, ticket_id, repo_full_name, role')
          .eq('repo_full_name', repoFullName)
          .eq('ticket_pk', ticketPk)
          .eq('role', role)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestError) {
          return json(res, 500, {
            success: false,
            error: `Failed to find latest bundle: ${latestError.message}`,
          })
        }

        latestBundle = data
      } else {
        // No ticket info, find the most recent bundle overall
        const { data, error: latestError } = await supabase
          .from('context_bundles')
          .select('bundle_id, ticket_pk, ticket_id, repo_full_name, role')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestError) {
          return json(res, 500, {
            success: false,
            error: `Failed to find latest bundle: ${latestError.message}`,
          })
        }

        latestBundle = data
      }

      if (!latestBundle) {
        // Store FAIL result
        const { error: insertError } = await supabase
          .from('cold_start_continuity_checks')
          .insert({
            run_id: runId,
            run_timestamp: runTimestamp,
            verdict: 'FAIL',
            failure_reason: 'missing_receipt',
            summary: ticketPk && repoFullName && role
              ? `No bundle found for ${repoFullName}/${ticketId || ticketPk}/${role}`
              : 'No bundles found in database',
            error_message: 'Bundle not found',
          })

        if (insertError) {
          console.error('Failed to store check result:', insertError)
        }

        return json(res, 200, {
          success: true,
          runId,
          runTimestamp,
          verdict: 'FAIL',
          failureReason: 'missing_receipt',
          summary: ticketPk && repoFullName && role
            ? `No bundle found for ${repoFullName}/${ticketId || ticketPk}/${role}`
            : 'No bundles found in database',
        })
      }

      bundleId = latestBundle.bundle_id
      ticketPk = latestBundle.ticket_pk
      ticketId = latestBundle.ticket_id
      repoFullName = latestBundle.repo_full_name
      role = latestBundle.role
    }

    // Fetch the receipt (baseline)
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
      // Store FAIL result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          run_timestamp: runTimestamp,
          verdict: 'FAIL',
          failure_reason: 'missing_receipt',
          summary: `No receipt found for bundle ${bundleId || `${repoFullName}/${ticketId || ticketPk}/${role}`}`,
          error_message: 'Receipt not found',
        })

      if (insertError) {
        console.error('Failed to store check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        runTimestamp,
        verdict: 'FAIL',
        failureReason: 'missing_receipt',
        summary: `No receipt found for bundle ${bundleId || `${repoFullName}/${ticketId || ticketPk}/${role}`}`,
      })
    }

    // Rebuild bundle from scratch
    const builderResult = await buildContextBundleV0({
      ticketPk,
      ticketId: ticketId || undefined,
      repoFullName,
      role,
      supabaseUrl,
      supabaseAnonKey,
      selectedArtifactIds: [], // Use all artifacts
      gitRef: null,
    })

    if (!builderResult.success || !builderResult.bundle) {
      // Store FAIL result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          run_timestamp: runTimestamp,
          verdict: 'FAIL',
          failure_reason: 'checksum_mismatch',
          summary: `Failed to rebuild bundle: ${builderResult.error || 'Unknown error'}`,
          error_message: builderResult.error || 'Unknown error',
        })

      if (insertError) {
        console.error('Failed to store check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        runTimestamp,
        verdict: 'FAIL',
        failureReason: 'checksum_mismatch',
        summary: `Failed to rebuild bundle: ${builderResult.error || 'Unknown error'}`,
      })
    }

    const rebuiltBundle = builderResult.bundle

    // Generate checksums for rebuilt bundle
    const rebuiltContentChecksum = generateContentChecksum(rebuiltBundle)
    
    // Get version from receipt or latest bundle
    let version = receipt.version || 1
    if (!receipt.version) {
      const { data: bundle } = await supabase
        .from('context_bundles')
        .select('version')
        .eq('bundle_id', receipt.bundle_id)
        .maybeSingle()
      if (bundle) {
        version = bundle.version
      }
    }

    const rebuiltBundleChecksum = generateBundleChecksum(rebuiltBundle, {
      repoFullName,
      ticketPk,
      ticketId: ticketId || '',
      role,
      version,
    })

    // Compare checksums
    const contentChecksumMatch = receipt.content_checksum === rebuiltContentChecksum
    const bundleChecksumMatch = receipt.bundle_checksum === rebuiltBundleChecksum

    // Check manifest reference
    const manifestReferenceMatch = 
      receipt.integration_manifest_reference === builderResult.integrationManifestReference?.manifest_id

    // Determine verdict
    let verdict: 'PASS' | 'FAIL' = 'PASS'
    let failureReason: string | null = null
    const issues: string[] = []

    if (!contentChecksumMatch) {
      verdict = 'FAIL'
      failureReason = 'checksum_mismatch'
      issues.push(`Content checksum mismatch: baseline ${receipt.content_checksum.substring(0, 16)}... vs rebuilt ${rebuiltContentChecksum.substring(0, 16)}...`)
    }

    if (!bundleChecksumMatch) {
      verdict = 'FAIL'
      if (!failureReason) failureReason = 'checksum_mismatch'
      issues.push(`Bundle checksum mismatch: baseline ${receipt.bundle_checksum.substring(0, 16)}... vs rebuilt ${rebuiltBundleChecksum.substring(0, 16)}...`)
    }

    if (!manifestReferenceMatch) {
      if (receipt.integration_manifest_reference && !builderResult.integrationManifestReference) {
        verdict = 'FAIL'
        if (!failureReason) failureReason = 'missing_manifest_reference'
        issues.push('Missing manifest reference in rebuilt bundle')
      } else if (receipt.integration_manifest_reference !== builderResult.integrationManifestReference?.manifest_id) {
        verdict = 'FAIL'
        if (!failureReason) failureReason = 'artifact_version_mismatch'
        issues.push(`Manifest reference mismatch: baseline ${receipt.integration_manifest_reference} vs rebuilt ${builderResult.integrationManifestReference?.manifest_id || 'none'}`)
      }
    }

    const summary = verdict === 'PASS'
      ? 'All checks passed: checksums match and manifest references are consistent'
      : `Check failed: ${issues.join('; ')}`

    // Store result
    const { error: insertError } = await supabase
      .from('cold_start_continuity_checks')
      .insert({
        run_id: runId,
        run_timestamp: runTimestamp,
        verdict,
        failure_reason: failureReason,
        summary,
        details: {
          baseline_content_checksum: receipt.content_checksum,
          rebuilt_content_checksum: rebuiltContentChecksum,
          baseline_bundle_checksum: receipt.bundle_checksum,
          rebuilt_bundle_checksum: rebuiltBundleChecksum,
          content_checksum_match: contentChecksumMatch,
          bundle_checksum_match: bundleChecksumMatch,
          baseline_manifest_reference: receipt.integration_manifest_reference,
          rebuilt_manifest_reference: builderResult.integrationManifestReference?.manifest_id || null,
          manifest_reference_match: manifestReferenceMatch,
          receipt_id: receipt.receipt_id,
          bundle_id: receipt.bundle_id,
          issues,
        },
      })

    if (insertError) {
      console.error('Failed to store check result:', insertError)
      // Still return the result even if storage fails
    }

    return json(res, 200, {
      success: true,
      runId,
      runTimestamp,
      verdict,
      failureReason,
      summary,
      details: {
        baselineContentChecksum: receipt.content_checksum,
        rebuiltContentChecksum,
        baselineBundleChecksum: receipt.bundle_checksum,
        rebuiltBundleChecksum,
        contentChecksumMatch,
        bundleChecksumMatch,
        baselineManifestReference: receipt.integration_manifest_reference,
        rebuiltManifestReference: builderResult.integrationManifestReference?.manifest_id || null,
        manifestReferenceMatch,
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

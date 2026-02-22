/**
 * API endpoint to run a cold-start continuity check.
 * Rebuilds a bundle from scratch and compares checksums to verify determinism.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { buildContextBundleV0 } from '../context-bundles/_builder.js'
import { generateContentChecksum, generateBundleChecksum } from '../context-bundles/_checksum.js'

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
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined
    const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Generate unique run ID
    const runId = `cold-start-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Fetch bundle and receipt
    let bundle: any = null
    let receipt: any = null
    let resolvedRepoFullName: string | undefined = repoFullName

    if (receiptId) {
      // Fetch by receipt ID
      const { data: receiptData, error: receiptError } = await supabase
        .from('bundle_receipts')
        .select('*, context_bundles(*)')
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
        })
      }

      receipt = receiptData
      bundle = receiptData.context_bundles
      resolvedRepoFullName = receiptData.repo_full_name
    } else if (bundleId) {
      // Fetch by bundle ID
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('*')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (bundleError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch bundle: ${bundleError.message}`,
        })
      }

      if (!bundleData) {
        return json(res, 404, {
          success: false,
          error: `Bundle ${bundleId} not found.`,
        })
      }

      bundle = bundleData
      resolvedRepoFullName = bundleData.repo_full_name

      // Fetch receipt for this bundle
      const { data: receiptData, error: receiptError } = await supabase
        .from('bundle_receipts')
        .select('*')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (receiptError) {
        // Receipt missing - this is a failure case
        return json(res, 200, {
          success: true,
          runId,
          verdict: 'FAIL',
          failureReason: 'missing_receipt',
          summary: `Bundle ${bundleId} exists but has no receipt.`,
          baselineChecksum: bundle.content_checksum || null,
          rebuiltChecksum: null,
          checksumMatch: null,
          bundleId: bundle.bundle_id,
          receiptId: null,
          integrationManifestReference: null,
          redReference: null,
        })
      }

      receipt = receiptData
    } else if (resolvedRepoFullName) {
      // Fetch latest bundle for repo
      const { data: latestBundle, error: bundleError } = await supabase
        .from('context_bundles')
        .select('*')
        .eq('repo_full_name', resolvedRepoFullName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (bundleError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch latest bundle: ${bundleError.message}`,
        })
      }

      if (!latestBundle) {
        return json(res, 404, {
          success: false,
          error: `No bundles found for repository ${resolvedRepoFullName}.`,
        })
      }

      bundle = latestBundle

      // Fetch receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from('bundle_receipts')
        .select('*')
        .eq('bundle_id', bundle.bundle_id)
        .maybeSingle()

      if (receiptError || !receiptData) {
        return json(res, 200, {
          success: true,
          runId,
          verdict: 'FAIL',
          failureReason: 'missing_receipt',
          summary: `Latest bundle for ${resolvedRepoFullName} has no receipt.`,
          baselineChecksum: bundle.content_checksum || null,
          rebuiltChecksum: null,
          checksumMatch: null,
          bundleId: bundle.bundle_id,
          receiptId: null,
          integrationManifestReference: null,
          redReference: null,
        })
      }

      receipt = receiptData
    } else {
      return json(res, 400, {
        success: false,
        error: 'bundleId, receiptId, or repoFullName is required.',
      })
    }

    if (!bundle) {
      return json(res, 404, {
        success: false,
        error: 'Bundle not found.',
      })
    }

    if (!receipt) {
      // Store failure result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          repo_full_name: resolvedRepoFullName || '',
          verdict: 'FAIL',
          failure_reason: 'missing_receipt',
          baseline_checksum: bundle.content_checksum || null,
          rebuilt_checksum: null,
          checksum_match: null,
          bundle_id: bundle.bundle_id,
          receipt_id: null,
          integration_manifest_reference: null,
          red_reference: null,
          summary: `Bundle ${bundle.bundle_id} exists but has no receipt.`,
        })

      if (insertError) {
        console.error('Failed to store check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        verdict: 'FAIL',
        failureReason: 'missing_receipt',
        summary: `Bundle ${bundle.bundle_id} exists but has no receipt.`,
        baselineChecksum: bundle.content_checksum || null,
        rebuiltChecksum: null,
        checksumMatch: null,
        bundleId: bundle.bundle_id,
        receiptId: null,
        integrationManifestReference: null,
        redReference: null,
      })
    }

    // Check for missing manifest reference
    if (!receipt.integration_manifest_reference) {
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          repo_full_name: resolvedRepoFullName || '',
          verdict: 'FAIL',
          failure_reason: 'missing_manifest_reference',
          baseline_checksum: receipt.content_checksum || null,
          rebuilt_checksum: null,
          checksum_match: null,
          bundle_id: bundle.bundle_id,
          receipt_id: receipt.receipt_id,
          integration_manifest_reference: null,
          red_reference: receipt.red_reference || null,
          summary: `Receipt ${receipt.receipt_id} is missing integration manifest reference.`,
        })

      if (insertError) {
        console.error('Failed to store check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        verdict: 'FAIL',
        failureReason: 'missing_manifest_reference',
        summary: `Receipt ${receipt.receipt_id} is missing integration manifest reference.`,
        baselineChecksum: receipt.content_checksum || null,
        rebuiltChecksum: null,
        checksumMatch: null,
        bundleId: bundle.bundle_id,
        receiptId: receipt.receipt_id,
        integrationManifestReference: null,
        redReference: receipt.red_reference || null,
      })
    }

    // Rebuild bundle from scratch
    const builderResult = await buildContextBundleV0({
      ticketPk: bundle.ticket_pk,
      ticketId: bundle.ticket_id,
      repoFullName: resolvedRepoFullName || bundle.repo_full_name,
      role: bundle.role,
      supabaseUrl,
      supabaseAnonKey,
    })

    if (!builderResult.success || !builderResult.bundle) {
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert({
          run_id: runId,
          repo_full_name: resolvedRepoFullName || '',
          verdict: 'FAIL',
          failure_reason: 'checksum_mismatch',
          baseline_checksum: receipt.content_checksum || null,
          rebuilt_checksum: null,
          checksum_match: false,
          bundle_id: bundle.bundle_id,
          receipt_id: receipt.receipt_id,
          integration_manifest_reference: receipt.integration_manifest_reference || null,
          red_reference: receipt.red_reference || null,
          summary: `Failed to rebuild bundle: ${builderResult.error || 'Unknown error'}`,
        })

      if (insertError) {
        console.error('Failed to store check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        runId,
        verdict: 'FAIL',
        failureReason: 'checksum_mismatch',
        summary: `Failed to rebuild bundle: ${builderResult.error || 'Unknown error'}`,
        baselineChecksum: receipt.content_checksum || null,
        rebuiltChecksum: null,
        checksumMatch: false,
        bundleId: bundle.bundle_id,
        receiptId: receipt.receipt_id,
        integrationManifestReference: receipt.integration_manifest_reference || null,
        redReference: receipt.red_reference || null,
      })
    }

    // Generate checksums for rebuilt bundle
    const rebuiltContentChecksum = generateContentChecksum(builderResult.bundle)
    const rebuiltBundleChecksum = generateBundleChecksum(builderResult.bundle, {
      repoFullName: resolvedRepoFullName || bundle.repo_full_name,
      ticketPk: bundle.ticket_pk,
      ticketId: bundle.ticket_id,
      role: bundle.role,
      version: bundle.version,
    })

    // Compare checksums
    const contentChecksumMatch = receipt.content_checksum === rebuiltContentChecksum
    const bundleChecksumMatch = receipt.bundle_checksum === rebuiltBundleChecksum
    const checksumMatch = contentChecksumMatch && bundleChecksumMatch

    // Check for artifact version mismatch (if RED reference exists)
    let artifactVersionMismatch = false
    if (receipt.red_reference && builderResult.redReference) {
      if (
        receipt.red_reference.red_id !== builderResult.redReference.red_id ||
        receipt.red_reference.version !== builderResult.redReference.version
      ) {
        artifactVersionMismatch = true
      }
    }

    // Determine verdict
    let verdict: 'PASS' | 'FAIL' = checksumMatch ? 'PASS' : 'FAIL'
    let failureReason: 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch' | null = null

    if (!checksumMatch) {
      failureReason = 'checksum_mismatch'
    } else if (artifactVersionMismatch) {
      verdict = 'FAIL'
      failureReason = 'artifact_version_mismatch'
    }

    // Build summary
    const summaryParts: string[] = []
    if (contentChecksumMatch && bundleChecksumMatch) {
      summaryParts.push('Content and bundle checksums match')
    } else {
      if (!contentChecksumMatch) {
        summaryParts.push(`Content checksum mismatch: baseline ${receipt.content_checksum?.substring(0, 16)}... vs rebuilt ${rebuiltContentChecksum.substring(0, 16)}...`)
      }
      if (!bundleChecksumMatch) {
        summaryParts.push(`Bundle checksum mismatch: baseline ${receipt.bundle_checksum?.substring(0, 16)}... vs rebuilt ${rebuiltBundleChecksum.substring(0, 16)}...`)
      }
    }
    if (artifactVersionMismatch) {
      summaryParts.push(`RED version mismatch: receipt ${receipt.red_reference?.version} vs rebuilt ${builderResult.redReference?.version}`)
    }
    const summary = summaryParts.join('; ') || 'Check completed successfully'

    // Store result
    const { error: insertError } = await supabase
      .from('cold_start_continuity_checks')
      .insert({
        run_id: runId,
        repo_full_name: resolvedRepoFullName || bundle.repo_full_name || '',
        verdict,
        failure_reason: failureReason,
        baseline_checksum: receipt.content_checksum || null,
        rebuilt_checksum: rebuiltContentChecksum,
        checksum_match: checksumMatch,
        bundle_id: bundle.bundle_id,
        receipt_id: receipt.receipt_id,
        integration_manifest_reference: receipt.integration_manifest_reference || null,
        red_reference: receipt.red_reference || null,
        summary,
      })

    if (insertError) {
      console.error('Failed to store check result:', insertError)
    }

    return json(res, 200, {
      success: true,
      runId,
      verdict,
      failureReason,
      summary,
      baselineChecksum: receipt.content_checksum || null,
      rebuiltChecksum: rebuiltContentChecksum,
      checksumMatch,
      bundleId: bundle.bundle_id,
      receiptId: receipt.receipt_id,
      integrationManifestReference: receipt.integration_manifest_reference || null,
      redReference: receipt.red_reference || null,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Error in cold-start continuity check handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

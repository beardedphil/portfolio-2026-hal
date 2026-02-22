/**
 * API endpoint to run a cold-start continuity check.
 * Rebuilds a context bundle from scratch and compares it with the baseline receipt.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { buildContextBundleV0 } from '../context-bundles/_builder.js'
import {
  generateContentChecksum,
  generateBundleChecksum,
} from '../context-bundles/_checksum.js'
import { getLatestManifest } from '../_lib/integration-manifest/context-integration.js'
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
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      role?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const role = typeof body.role === 'string' ? body.role.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!repoFullName) {
      return json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
    }

    if (!role) {
      return json(res, 400, {
        success: false,
        error: 'role is required (e.g., "implementation-agent", "qa-agent", "project-manager").',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Resolve ticket_pk if only ticketId provided
    let resolvedTicketPk = ticketPk
    let resolvedTicketId = ticketId

    if (!resolvedTicketPk && resolvedTicketId) {
      // Try lookup by display_id first, then by id
      let ticketData = null
      let ticketError = null

      // Try display_id
      const byDisplayId = await supabase
        .from('tickets')
        .select('pk, id, display_id, repo_full_name')
        .eq('display_id', resolvedTicketId)
        .maybeSingle()

      if (byDisplayId.error || !byDisplayId.data) {
        // Try id
        const byId = await supabase
          .from('tickets')
          .select('pk, id, display_id, repo_full_name')
          .eq('id', resolvedTicketId)
          .maybeSingle()

        if (byId.error) {
          ticketError = byId.error
        } else if (byId.data) {
          ticketData = byId.data
        }
      } else {
        ticketData = byDisplayId.data
      }

      if (ticketError || !ticketData) {
        return json(res, 404, {
          success: false,
          error: `Ticket not found: ${resolvedTicketId}`,
        })
      }

      resolvedTicketPk = ticketData.pk
      resolvedTicketId = ticketData.display_id || ticketData.id
      
      // If repoFullName wasn't provided, use the one from the ticket
      if (!repoFullName && ticketData.repo_full_name) {
        // Note: We can't modify repoFullName here since it's const, but we'll use ticketData.repo_full_name in the query
      }
    }

    // Get the latest receipt for this ticket/role
    // First, get the ticket to ensure we have repo_full_name
    const { data: ticketData } = await supabase
      .from('tickets')
      .select('repo_full_name')
      .eq('pk', resolvedTicketPk)
      .maybeSingle()

    const resolvedRepoFullName = ticketData?.repo_full_name || repoFullName

    if (!resolvedRepoFullName) {
      return json(res, 400, {
        success: false,
        error: 'Could not determine repo_full_name for ticket.',
      })
    }

    const { data: receiptData, error: receiptError } = await supabase
      .from('bundle_receipts')
      .select('*, context_bundles!bundle_receipts_bundle_id_fkey(bundle_id, version)')
      .eq('ticket_pk', resolvedTicketPk)
      .eq('role', role)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (receiptError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch receipt: ${receiptError.message}`,
      })
    }

    if (!receiptData) {
      // Missing receipt - this is a failure
      const runId = randomUUID()
      const checkResult = {
        check_id: randomUUID(),
        run_id: runId,
        repo_full_name: repoFullName,
        ticket_pk: resolvedTicketPk,
        ticket_id: resolvedTicketId || 'unknown',
        role: role,
        verdict: 'FAIL' as const,
        failure_reason: 'missing_receipt' as const,
        baseline_bundle_id: null,
        rebuilt_bundle_id: null,
        baseline_content_checksum: null,
        rebuilt_content_checksum: null,
        baseline_bundle_checksum: null,
        rebuilt_bundle_checksum: null,
        comparison_details: {
          error: 'No receipt found for this ticket and role',
        },
        summary: `No baseline receipt found for ticket ${resolvedTicketId || resolvedTicketPk} with role ${role}. Cannot perform continuity check.`,
        created_at: new Date().toISOString(),
      }

      // Store the result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert(checkResult)

      if (insertError) {
        console.error('Failed to store continuity check result:', insertError)
        // Continue anyway - return the result even if storage fails
      }

      return json(res, 200, {
        success: true,
        result: {
          runId,
          verdict: 'FAIL',
          failureReason: 'missing_receipt',
          completedAt: checkResult.created_at,
          summary: checkResult.summary,
          comparisonDetails: checkResult.comparison_details,
        },
      })
    }

    const receipt = receiptData
    const baselineBundleId = receipt.bundle_id
    const baselineContentChecksum = receipt.content_checksum
    const baselineBundleChecksum = receipt.bundle_checksum

    // Rebuild the bundle from scratch
    const buildResult = await buildContextBundleV0({
      ticketPk: resolvedTicketPk,
      ticketId: resolvedTicketId || 'unknown',
      repoFullName: resolvedRepoFullName,
      role: role,
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
    })

    if (!buildResult.success || !buildResult.bundle) {
      // Build failed - this is a failure
      const runId = randomUUID()
      const checkResult = {
        check_id: randomUUID(),
        run_id: runId,
        repo_full_name: repoFullName,
        ticket_pk: resolvedTicketPk,
        ticket_id: resolvedTicketId || 'unknown',
        role: role,
        verdict: 'FAIL' as const,
        failure_reason: 'checksum_mismatch' as const, // Closest match - build failed
        baseline_bundle_id: baselineBundleId,
        rebuilt_bundle_id: null,
        baseline_content_checksum: baselineContentChecksum,
        rebuilt_content_checksum: null,
        baseline_bundle_checksum: baselineBundleChecksum,
        rebuilt_bundle_checksum: null,
        comparison_details: {
          error: buildResult.error || 'Bundle rebuild failed',
          buildError: true,
        },
        summary: `Failed to rebuild bundle: ${buildResult.error || 'Unknown error'}`,
        created_at: new Date().toISOString(),
      }

      // Store the result
      const { error: insertError } = await supabase
        .from('cold_start_continuity_checks')
        .insert(checkResult)

      if (insertError) {
        console.error('Failed to store continuity check result:', insertError)
      }

      return json(res, 200, {
        success: true,
        result: {
          runId,
          verdict: 'FAIL',
          failureReason: 'checksum_mismatch',
          completedAt: checkResult.created_at,
          summary: checkResult.summary,
          comparisonDetails: checkResult.comparison_details,
        },
      })
    }

    const rebuiltBundle = buildResult.bundle

    // Generate checksums for the rebuilt bundle
    const rebuiltContentChecksum = generateContentChecksum(rebuiltBundle)
    const rebuiltBundleChecksum = generateBundleChecksum(rebuiltBundle, {
      repoFullName: resolvedRepoFullName,
      ticketPk: resolvedTicketPk,
      ticketId: resolvedTicketId || 'unknown',
      role: role,
      version: rebuiltBundle.meta.version || 1,
    })

    // Compare checksums
    const contentChecksumsMatch = baselineContentChecksum === rebuiltContentChecksum
    const bundleChecksumsMatch = baselineBundleChecksum === rebuiltBundleChecksum

    // Check manifest reference
    const baselineManifestRef = receipt.integration_manifest_reference
    const rebuiltManifestRef = buildResult.integrationManifestReference
    const manifestRefMatch = 
      baselineManifestRef && rebuiltManifestRef &&
      baselineManifestRef.manifest_id === rebuiltManifestRef.manifest_id &&
      baselineManifestRef.version === rebuiltManifestRef.version

    // Check artifact version mismatch (simplified - check if RED reference matches)
    const baselineRedRef = receipt.red_reference
    const rebuiltRedRef = buildResult.redReference
    const redRefMatch =
      baselineRedRef && rebuiltRedRef &&
      baselineRedRef.red_id === rebuiltRedRef.red_id &&
      baselineRedRef.version === rebuiltRedRef.version

    // Determine verdict and failure reason
    let verdict: 'PASS' | 'FAIL' = 'PASS'
    let failureReason: 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch' | null = null

    if (!contentChecksumsMatch || !bundleChecksumsMatch) {
      verdict = 'FAIL'
      failureReason = 'checksum_mismatch'
    } else if (!baselineManifestRef || !rebuiltManifestRef) {
      verdict = 'FAIL'
      failureReason = 'missing_manifest_reference'
    } else if (!manifestRefMatch) {
      verdict = 'FAIL'
      failureReason = 'artifact_version_mismatch'
    } else if (!baselineRedRef || !rebuiltRedRef) {
      // RED reference missing - could be artifact version mismatch
      verdict = 'FAIL'
      failureReason = 'artifact_version_mismatch'
    } else if (!redRefMatch) {
      verdict = 'FAIL'
      failureReason = 'artifact_version_mismatch'
    }

    const runId = randomUUID()
    const comparisonDetails = {
      contentChecksumsMatch,
      bundleChecksumsMatch,
      manifestReferenceMatch: manifestRefMatch,
      redReferenceMatch: redRefMatch,
      baselineContentChecksum: baselineContentChecksum.substring(0, 16) + '...',
      rebuiltContentChecksum: rebuiltContentChecksum.substring(0, 16) + '...',
      baselineBundleChecksum: baselineBundleChecksum.substring(0, 16) + '...',
      rebuiltBundleChecksum: rebuiltBundleChecksum.substring(0, 16) + '...',
      baselineManifestRef,
      rebuiltManifestRef,
      baselineRedRef,
      rebuiltRedRef,
    }

    const summary = verdict === 'PASS'
      ? `Continuity check passed: All checksums match and references are consistent.`
      : `Continuity check failed: ${failureReason === 'checksum_mismatch' ? 'Checksums do not match' : failureReason === 'missing_manifest_reference' ? 'Manifest reference missing' : 'Artifact version mismatch'}.`

    const checkResult = {
      check_id: randomUUID(),
      run_id: runId,
      repo_full_name: resolvedRepoFullName,
      ticket_pk: resolvedTicketPk,
      ticket_id: resolvedTicketId || 'unknown',
      role: role,
      verdict,
      failure_reason: failureReason,
      baseline_bundle_id: baselineBundleId,
      rebuilt_bundle_id: null, // We don't store the rebuilt bundle, just compare
      baseline_content_checksum: baselineContentChecksum,
      rebuilt_content_checksum: rebuiltContentChecksum,
      baseline_bundle_checksum: baselineBundleChecksum,
      rebuilt_bundle_checksum: rebuiltBundleChecksum,
      comparison_details: comparisonDetails,
      summary,
      created_at: new Date().toISOString(),
    }

    // Store the result
    const { error: insertError } = await supabase
      .from('cold_start_continuity_checks')
      .insert(checkResult)

    if (insertError) {
      console.error('Failed to store continuity check result:', insertError)
      // Continue anyway - return the result even if storage fails
    }

    return json(res, 200, {
      success: true,
      result: {
        runId,
        verdict,
        failureReason: failureReason || undefined,
        completedAt: checkResult.created_at,
        summary,
        comparisonDetails,
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

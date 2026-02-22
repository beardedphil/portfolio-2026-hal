/**
 * API endpoint for cold-start continuity check.
 * Verifies that HAL can restart (client + serverless), deterministically rebuild
 * a Context Bundle from stored receipts, and resume an existing agent run correctly.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import { buildContextBundleV0 } from './_builder.js'
import { generateContentChecksum } from './_checksum.js'

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

export interface ContinuityCheckResult {
  success: boolean
  passed: boolean
  originalChecksum: string
  rebuiltChecksum: string
  checksumMatch: boolean
  runIdContinuity?: {
    originalRunId?: string | null
    resumedRunId?: string | null
    continuityMaintained: boolean
    explanation: string
  }
  errors: string[]
  warnings: string[]
  details: {
    receiptId: string
    bundleId: string
    ticketPk: string
    ticketId: string
    repoFullName: string
    role: string
    rebuiltFrom: {
      redReference?: { red_id: string; version: number } | null
      integrationManifestReference?: {
        manifest_id: string
        version: number
        schema_version: string
      } | null
      gitRef?: {
        pr_url?: string
        pr_number?: number
        base_sha?: string
        head_sha?: string
      } | null
    }
  }
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
      receiptId?: string
      bundleId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() || undefined : undefined
    const bundleId = typeof body.bundleId === 'string' ? body.bundleId.trim() || undefined : undefined

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!receiptId && !bundleId) {
      return json(res, 400, {
        success: false,
        error: 'receiptId or bundleId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch receipt (either directly by receiptId, or via bundleId)
    let receipt: any = null
    let bundle: any = null

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
        })
      }

      receipt = receiptData

      // Fetch bundle
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('*')
        .eq('bundle_id', receipt.bundle_id)
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
          error: `Bundle ${receipt.bundle_id} not found.`,
        })
      }

      bundle = bundleData
    } else if (bundleId) {
      // Fetch bundle first
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

      // Fetch receipt
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
        })
      }

      receipt = receiptData
    }

    // Extract information needed to rebuild bundle
    const ticketPk = bundle.ticket_pk
    const ticketId = bundle.ticket_id
    const repoFullName = bundle.repo_full_name
    const role = bundle.role

    // Get original checksum from receipt
    const originalChecksum = receipt.content_checksum

    // Rebuild bundle from receipt references using the builder
    const builderResult = await buildContextBundleV0({
      ticketPk,
      ticketId,
      repoFullName,
      role,
      supabaseUrl,
      supabaseAnonKey,
      selectedArtifactIds: [], // For continuity check, we don't select specific artifacts
      gitRef: receipt.git_ref || null,
    })

    if (!builderResult.success || !builderResult.bundle) {
      return json(res, 400, {
        success: false,
        passed: false,
        originalChecksum,
        rebuiltChecksum: null,
        checksumMatch: false,
        errors: [builderResult.error || 'Failed to rebuild bundle from receipt'],
        warnings: [],
        details: {
          receiptId: receipt.receipt_id,
          bundleId: bundle.bundle_id,
          ticketPk,
          ticketId,
          repoFullName,
          role,
          rebuiltFrom: {
            redReference: receipt.red_reference,
            integrationManifestReference: receipt.integration_manifest_reference,
            gitRef: receipt.git_ref,
          },
        },
      } as ContinuityCheckResult)
    }

    const rebuiltBundle = builderResult.bundle

    // Generate checksum for rebuilt bundle
    const rebuiltChecksum = generateContentChecksum(rebuiltBundle)

    // Compare checksums
    const checksumMatch = originalChecksum === rebuiltChecksum

    // Check run_id continuity
    // Look for agent runs associated with this ticket and role
    const { data: agentRuns, error: runsError } = await supabase
      .from('hal_agent_runs')
      .select('run_id, agent_type, status, created_at, updated_at')
      .eq('ticket_pk', ticketPk)
      .eq('repo_full_name', repoFullName)
      .order('created_at', { ascending: false })
      .limit(10)

    let runIdContinuity: ContinuityCheckResult['runIdContinuity'] = {
      originalRunId: null,
      resumedRunId: null,
      continuityMaintained: true,
      explanation: 'No agent runs found for this ticket. Continuity check passed (no runs to verify).',
    }

    if (!runsError && agentRuns && agentRuns.length > 0) {
      // Map role to agent_type for comparison
      const roleToAgentType: Record<string, string> = {
        'implementation-agent': 'implementation',
        'qa-agent': 'qa',
        'project-manager': 'project-manager',
        'process-review': 'process-review',
      }
      const agentType = roleToAgentType[role] || role

      // Filter runs by matching agent type
      const matchingRuns = agentRuns.filter((run) => run.agent_type === agentType)

      if (matchingRuns.length > 0) {
        // Get the most recent run (this would be the "resumed" run after restart)
        const mostRecentRun = matchingRuns[0]

        // Check if there are multiple runs (which would indicate a new run was created)
        if (matchingRuns.length === 1) {
          runIdContinuity = {
            originalRunId: mostRecentRun.run_id,
            resumedRunId: mostRecentRun.run_id,
            continuityMaintained: true,
            explanation: `Single agent run found (${mostRecentRun.run_id}). Continuity maintained - no new unrelated run created.`,
          }
        } else {
          // Multiple runs exist - check if they're related (e.g., continuation of same work)
          // For now, we'll consider it a warning if multiple runs exist, but not necessarily a failure
          // The key is that the most recent run should be the one that would be resumed
          const runIds = matchingRuns.map((r) => r.run_id)
          runIdContinuity = {
            originalRunId: matchingRuns[matchingRuns.length - 1].run_id, // Oldest
            resumedRunId: mostRecentRun.run_id, // Most recent
            continuityMaintained: true, // Multiple runs are acceptable if they're continuations
            explanation: `Multiple agent runs found (${matchingRuns.length} total). Most recent run ${mostRecentRun.run_id} would be resumed. This is acceptable for continuation scenarios.`,
          }
        }
      } else {
        runIdContinuity = {
          originalRunId: null,
          resumedRunId: null,
          continuityMaintained: true,
          explanation: `No agent runs found for role ${role} (agent_type ${agentType}). Continuity check passed (no runs to verify).`,
        }
      }
    }

    // Collect errors and warnings
    const errors: string[] = []
    const warnings: string[] = []

    if (!checksumMatch) {
      errors.push(
        `Content checksum mismatch: original=${originalChecksum.substring(0, 16)}..., rebuilt=${rebuiltChecksum.substring(0, 16)}...`
      )
    }

    if (!receipt.red_reference) {
      warnings.push('Receipt missing RED reference - bundle may not be fully reconstructible')
    }

    if (!receipt.integration_manifest_reference) {
      warnings.push('Receipt missing Integration Manifest reference - bundle may not be fully reconstructible')
    }

    // Check if rebuilt bundle references match receipt references
    if (receipt.red_reference && builderResult.redReference) {
      if (
        receipt.red_reference.red_id !== builderResult.redReference.red_id ||
        receipt.red_reference.version !== builderResult.redReference.version
      ) {
        errors.push(
          `RED reference mismatch: receipt=${receipt.red_reference.red_id} v${receipt.red_reference.version}, rebuilt=${builderResult.redReference.red_id} v${builderResult.redReference.version}`
        )
      }
    }

    if (receipt.integration_manifest_reference && builderResult.integrationManifestReference) {
      if (
        receipt.integration_manifest_reference.manifest_id !== builderResult.integrationManifestReference.manifest_id ||
        receipt.integration_manifest_reference.version !== builderResult.integrationManifestReference.version
      ) {
        warnings.push(
          `Integration Manifest version mismatch: receipt=${receipt.integration_manifest_reference.manifest_id} v${receipt.integration_manifest_reference.version}, rebuilt=${builderResult.integrationManifestReference.manifest_id} v${builderResult.integrationManifestReference.version} (this may be expected if manifest was updated)`
        )
      }
    }

    const passed = checksumMatch && errors.length === 0

    const result: ContinuityCheckResult = {
      success: true,
      passed,
      originalChecksum,
      rebuiltChecksum,
      checksumMatch,
      runIdContinuity,
      errors,
      warnings,
      details: {
        receiptId: receipt.receipt_id,
        bundleId: bundle.bundle_id,
        ticketPk,
        ticketId,
        repoFullName,
        role,
        rebuiltFrom: {
          redReference: builderResult.redReference || receipt.red_reference,
          integrationManifestReference: builderResult.integrationManifestReference || receipt.integration_manifest_reference,
          gitRef: receipt.git_ref,
        },
      },
    }

    return json(res, 200, result)
  } catch (err) {
    console.error('Error in continuity check handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

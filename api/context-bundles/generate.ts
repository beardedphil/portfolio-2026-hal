/**
 * API endpoint to generate and store a Context Bundle for a ticket.
 * Creates both the bundle and its receipt with checksums and metrics.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import {
  generateContentChecksum,
  generateBundleChecksum,
  calculateSectionMetrics,
  calculateTotalCharacters,
} from './_checksum.js'
import { getLatestManifest } from '../_lib/integration-manifest/context-integration.js'
import { getSession } from '../_lib/github/session.js'
import { buildContextBundleV0 } from './_builder.js'
import { getServerSupabase } from '../agent-runs/_shared.js'

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
      bundleJson?: unknown
      selectedArtifactIds?: string[]
      supabaseUrl?: string
      supabaseAnonKey?: string
      redReference?: { red_id: string; version: number } | null
      gitRef?: {
        pr_url?: string
        pr_number?: number
        base_sha?: string
        head_sha?: string
      } | null
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const role = typeof body.role === 'string' ? body.role.trim() || undefined : undefined
    const selectedArtifactIds = Array.isArray(body.selectedArtifactIds)
      ? body.selectedArtifactIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []

    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketPk && !ticketId) {
      return json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
    }

    if (!role) {
      return json(res, 400, {
        success: false,
        error: 'role is required (e.g., "implementation-agent", "qa-agent", "project-manager").',
      })
    }

    // Use server-side Supabase if credentials not provided (for builder)
    const supabase = supabaseUrl && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey)
      : getServerSupabase()

    // If we have ticketId but not ticketPk, fetch ticket to get ticketPk and repoFullName
    let resolvedTicketPk: string | undefined = ticketPk
    let resolvedRepoFullName: string | undefined = repoFullName
    let resolvedTicketId: string | undefined = ticketId

    if (!resolvedTicketPk && ticketId) {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, repo_full_name, id')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch ticket: ${ticketError.message}`,
        })
      }

      if (!ticket) {
        return json(res, 404, {
          success: false,
          error: `Ticket ${ticketId} not found.`,
        })
      }

      resolvedTicketPk = ticket.pk
      resolvedRepoFullName = ticket.repo_full_name
      resolvedTicketId = ticket.id
    } else if (resolvedTicketPk && !resolvedRepoFullName) {
      // Fetch repo_full_name if we have ticketPk but not repoFullName
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('repo_full_name, id')
        .eq('pk', resolvedTicketPk)
        .maybeSingle()

      if (ticketError) {
        return json(res, 500, {
          success: false,
          error: `Failed to fetch ticket: ${ticketError.message}`,
        })
      }

      if (ticket) {
        resolvedRepoFullName = ticket.repo_full_name
        resolvedTicketId = ticket.id || resolvedTicketId
      }
    }

    if (!resolvedTicketPk || !resolvedRepoFullName || !resolvedTicketId) {
      return json(res, 400, {
        success: false,
        error: 'Could not resolve ticket_pk, repo_full_name, and ticket_id. Please provide ticketPk and repoFullName, or ticketId.',
      })
    }

    // Get GitHub token from session or environment for PR diff fetching
    let githubToken: string | undefined = undefined
    try {
      const session = await getSession(req, res)
      githubToken = session.github?.access_token
    } catch {
      // Session not available, try environment variable
      githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN
    }

    // Get PR URL from gitRef if provided
    const prUrl = body.gitRef?.pr_url

    // Build bundle using builder
    const buildResult = await buildContextBundleV0({
      ticketPk: resolvedTicketPk,
      ticketId: resolvedTicketId,
      repoFullName: resolvedRepoFullName,
      role,
      supabase,
      githubToken,
      prUrl,
    })

    if (!buildResult.success) {
      return json(res, 400, {
        success: false,
        error: buildResult.error,
      })
    }

    const { bundle: builtBundle, redReference } = buildResult

    // Get latest version for this ticket and role
    const { data: latestBundles, error: latestError } = await supabase
      .from('context_bundles')
      .select('version')
      .eq('repo_full_name', resolvedRepoFullName)
      .eq('ticket_pk', resolvedTicketPk)
      .eq('role', role)
      .order('version', { ascending: false })
      .limit(1)

    if (latestError) {
      return json(res, 500, {
        success: false,
        error: `Failed to query existing bundles: ${latestError.message}`,
      })
    }

    const nextVersion = latestBundles && latestBundles.length > 0 ? latestBundles[0].version + 1 : 1

    // Use bundle from builder (already has content_checksum computed)
    const finalBundleJson = builtBundle

    // Verify content checksum matches (builder already computed it)
    const contentChecksum = builtBundle.meta.content_checksum || generateContentChecksum(finalBundleJson)
    const bundleChecksum = generateBundleChecksum(finalBundleJson, {
      repoFullName: resolvedRepoFullName,
      ticketPk: resolvedTicketPk,
      ticketId: resolvedTicketId,
      role,
      version: nextVersion,
    })

    // Get integration manifest reference
    const manifestRef = await getLatestManifest(resolvedRepoFullName, 'v0')
    const integrationManifestReference = manifestRef
      ? {
          manifest_id: manifestRef.manifest_id,
          version: manifestRef.version,
          schema_version: manifestRef.schema_version,
        }
      : null

    // Get user identifier from session (if available)
    let createdBy: string | undefined = 'system'
    try {
      const session = await getSession(req, res)
      if (session.github?.user?.login) {
        createdBy = `user:${session.github.user.login}`
      }
    } catch {
      // Session not available, use default
    }

    // Insert bundle
    const { data: newBundle, error: insertError } = await supabase
      .from('context_bundles')
      .insert({
        repo_full_name: resolvedRepoFullName,
        ticket_pk: resolvedTicketPk,
        ticket_id: resolvedTicketId,
        role,
        version: nextVersion,
        bundle_json: finalBundleJson,
        content_checksum: contentChecksum,
        bundle_checksum: bundleChecksum,
        created_by: createdBy,
      })
      .select()
      .single()

    if (insertError) {
      return json(res, 500, {
        success: false,
        error: `Failed to store bundle: ${insertError.message}`,
      })
    }

    // Calculate section metrics
    const sectionMetrics = calculateSectionMetrics(finalBundleJson)
    const totalCharacters = calculateTotalCharacters(sectionMetrics)

    // Insert receipt
    const { data: newReceipt, error: receiptError } = await supabase
      .from('bundle_receipts')
      .insert({
        bundle_id: newBundle.bundle_id,
        repo_full_name: resolvedRepoFullName,
        ticket_pk: resolvedTicketPk,
        ticket_id: resolvedTicketId,
        role,
        content_checksum: contentChecksum,
        bundle_checksum: bundleChecksum,
        section_metrics: sectionMetrics,
        total_characters: totalCharacters,
        red_reference: redReference,
        integration_manifest_reference: integrationManifestReference,
        git_ref: body.gitRef || null,
      })
      .select()
      .single()

    if (receiptError) {
      // Bundle was created but receipt failed - this is a problem
      // We could rollback, but for now just return an error
      return json(res, 500, {
        success: false,
        error: `Bundle created but failed to store receipt: ${receiptError.message}`,
      })
    }

    return json(res, 200, {
      success: true,
      bundle: {
        bundle_id: newBundle.bundle_id,
        version: newBundle.version,
        role: newBundle.role,
        created_at: newBundle.created_at,
      },
      receipt: {
        receipt_id: newReceipt.receipt_id,
        content_checksum: newReceipt.content_checksum,
        bundle_checksum: newReceipt.bundle_checksum,
        section_metrics: newReceipt.section_metrics,
        total_characters: newReceipt.total_characters,
      },
    })
  } catch (err) {
    console.error('Error in generate context bundle handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

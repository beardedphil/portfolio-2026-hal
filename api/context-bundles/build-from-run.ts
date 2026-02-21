/**
 * API endpoint to build a Context Bundle from an agent run.
 * Creates a deterministic, reproducible bundle from the agent run's context.
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
import { readJsonBody, json } from '../agent-runs/_shared.js'

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
      runId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const runId = typeof body.runId === 'string' ? body.runId.trim() : undefined
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!runId) {
      return json(res, 400, {
        success: false,
        error: 'runId is required.',
      })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch agent run
    const { data: run, error: runError } = await supabase
      .from('hal_agent_runs')
      .select('*')
      .eq('run_id', runId)
      .maybeSingle()

    if (runError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch agent run: ${runError.message}`,
      })
    }

    if (!run) {
      return json(res, 404, {
        success: false,
        error: `Agent run ${runId} not found.`,
      })
    }

    // Validate that run has required fields
    if (!run.ticket_pk || !run.repo_full_name) {
      return json(res, 400, {
        success: false,
        error: 'Agent run must have ticket_pk and repo_full_name to build a context bundle.',
      })
    }

    // Fetch ticket to get ticket_id
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, id, display_id, body_md')
      .eq('pk', run.ticket_pk)
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
        error: `Ticket ${run.ticket_pk} not found.`,
      })
    }

    // Fetch agent run events
    const { data: events, error: eventsError } = await supabase
      .from('hal_agent_run_events')
      .select('*')
      .eq('run_id', runId)
      .order('id', { ascending: true })

    if (eventsError) {
      return json(res, 500, {
        success: false,
        error: `Failed to fetch agent run events: ${eventsError.message}`,
      })
    }

    // Map agent_type to role for context bundle
    const roleMap: Record<string, string> = {
      implementation: 'implementation-agent',
      qa: 'qa-agent',
      'project-manager': 'project-manager',
      'process-review': 'process-review',
    }
    const role = roleMap[run.agent_type] || run.agent_type

    // Build deterministic bundle JSON from agent run data
    const bundleJson = {
      ticket: {
        ticket_pk: run.ticket_pk,
        ticket_id: ticket.id,
        display_id: ticket.display_id,
        body_md: ticket.body_md || '',
      },
      agent_run: {
        run_id: run.run_id,
        agent_type: run.agent_type,
        status: run.status,
        current_stage: run.current_stage || null,
        provider: run.provider || null,
        model: run.model || null,
        created_at: run.created_at,
        updated_at: run.updated_at,
        finished_at: run.finished_at || null,
      },
      progress: Array.isArray(run.progress) ? run.progress : [],
      events: (events || []).map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        created_at: e.created_at,
      })),
      input_json: run.input_json || null,
      output_json: run.output_json || null,
      summary: run.summary || null,
      error: run.error || null,
      repo_context: {
        repo_full_name: run.repo_full_name,
        ticket_number: run.ticket_number,
        display_id: run.display_id,
      },
    }

    // Get latest version for this ticket and role
    const { data: latestBundles, error: latestError } = await supabase
      .from('context_bundles')
      .select('version')
      .eq('repo_full_name', run.repo_full_name)
      .eq('ticket_pk', run.ticket_pk)
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

    // Generate checksums
    const contentChecksum = generateContentChecksum(bundleJson)
    const bundleChecksum = generateBundleChecksum(bundleJson, {
      repoFullName: run.repo_full_name,
      ticketPk: run.ticket_pk,
      ticketId: ticket.id,
      role,
      version: nextVersion,
    })

    // Get integration manifest reference
    const manifestRef = await getLatestManifest(run.repo_full_name, 'v0')
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
        repo_full_name: run.repo_full_name,
        ticket_pk: run.ticket_pk,
        ticket_id: ticket.id,
        role,
        version: nextVersion,
        bundle_json: bundleJson,
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
    const sectionMetrics = calculateSectionMetrics(bundleJson)
    const totalCharacters = calculateTotalCharacters(sectionMetrics)

    // Extract git ref from run if available
    const gitRef = run.pr_url
      ? {
          pr_url: run.pr_url,
          pr_number: run.ticket_number || null,
        }
      : null

    // Insert receipt
    const { data: newReceipt, error: receiptError } = await supabase
      .from('bundle_receipts')
      .insert({
        bundle_id: newBundle.bundle_id,
        repo_full_name: run.repo_full_name,
        ticket_pk: run.ticket_pk,
        ticket_id: ticket.id,
        role,
        content_checksum: contentChecksum,
        bundle_checksum: bundleChecksum,
        section_metrics: sectionMetrics,
        total_characters: totalCharacters,
        red_reference: null,
        integration_manifest_reference: integrationManifestReference,
        git_ref: gitRef,
      })
      .select()
      .single()

    if (receiptError) {
      // Bundle was created but receipt failed - this is a problem
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
        bundle_json: bundleJson,
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
    console.error('Error in build context bundle from run handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

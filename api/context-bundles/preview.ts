/**
 * API endpoint to preview a Context Bundle without saving it.
 * Returns budget information and section metrics for UI validation.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'
import {
  calculateSectionMetrics,
  calculateTotalCharactersFromBundle,
} from './_checksum.js'
import { buildContextBundleV0 } from './_builder.js'
import { getRoleBudget, exceedsBudget, calculateOverage } from './_budgets.js'

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
      selectedArtifactIds?: string[]
      supabaseUrl?: string
      supabaseAnonKey?: string
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

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

    // Get role budget
    const budget = getRoleBudget(role)
    if (!budget) {
      return json(res, 400, {
        success: false,
        error: `Unknown role: ${role}. Valid roles: implementation-agent, qa-agent, project-manager, process-review`,
      })
    }

    // Build bundle (without saving)
    const builderResult = await buildContextBundleV0({
      ticketPk: resolvedTicketPk,
      ticketId: resolvedTicketId,
      repoFullName: resolvedRepoFullName,
      role,
      supabaseUrl,
      supabaseAnonKey,
      selectedArtifactIds,
      gitRef: body.gitRef || null,
    })

    if (!builderResult.success || !builderResult.bundle) {
      return json(res, 400, {
        success: false,
        error: builderResult.error || 'Failed to build bundle',
      })
    }

    const bundle = builderResult.bundle

    // Calculate character count from exact JSON payload (deterministic)
    const totalCharacters = calculateTotalCharactersFromBundle(bundle)
    const sectionMetrics = calculateSectionMetrics(bundle)
    const exceeds = exceedsBudget(role, totalCharacters)
    const overage = exceeds ? calculateOverage(role, totalCharacters) : 0

    return json(res, 200, {
      success: true,
      budget: {
        characterCount: totalCharacters,
        hardLimit: budget.hardLimit,
        role: budget.role,
        displayName: budget.displayName,
        exceeds,
        overage,
      },
      sectionMetrics,
      bundle: bundle, // Include bundle content for preview
    })
  } catch (err) {
    console.error('Error in preview context bundle handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import { parseSupabaseCredentialsWithServiceRole, fetchTicketByPkOrId, json, readJsonBody } from './_shared.js'
import { createBranch, createDraftPullRequest, getRefSha } from '../_lib/github/index.js'
import { listRepos } from '../_lib/github/index.js'

/**
 * Generate branch name from ticket display_id and title.
 * Format: ticket/0771-automation-create-feature-branch-draft-pr-immediately
 */
function generateBranchName(displayId: string, title: string): string {
  // Extract numeric part from display_id (e.g., "HAL-0771" -> "0771")
  const numericPart = displayId.replace(/^[A-Z]+-/, '').replace(/^0+/, '') || displayId.replace(/^[A-Z]+-/, '')
  const paddedNumber = numericPart.padStart(4, '0')
  
  // Create slug from title: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) // Limit length
  
  return `ticket/${paddedNumber}-${slug}`
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required.',
      })
      return
    }

    // Get GitHub session
    const session = await getSession(req, res)
    if (!session.github?.accessToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required. Please sign in with GitHub.',
      })
      return
    }

    const ghToken = session.github.accessToken
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket
    const ticketFetch = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)
    if (!ticketFetch || ticketFetch.error || !ticketFetch.data) {
      json(res, 404, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticket = ticketFetch.data

    // Check if PR already exists
    if (ticket.pr_url) {
      json(res, 200, {
        success: true,
        pr_url: ticket.pr_url,
        pr_number: ticket.pr_number,
        branch_name: ticket.branch_name,
        base_commit_sha: ticket.base_commit_sha,
        head_commit_sha: ticket.head_commit_sha,
        message: 'PR already exists for this ticket.',
      })
      return
    }

    // Get repo info
    const repoFullName = ticket.repo_full_name
    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'Ticket has no repo_full_name.',
      })
      return
    }

    // Get default branch - try to get from repo API, fallback to 'main'
    let defaultBranch = 'main'
    try {
      const repos = await listRepos(ghToken, 1)
      const repo = repos.find((r) => r.full_name === repoFullName)
      if (repo && repo.default_branch) {
        defaultBranch = repo.default_branch
      }
    } catch (err) {
      // Fallback to 'main' if repo lookup fails
      console.warn('Failed to get default branch from repo list, using "main":', err)
    }

    // Generate branch name
    const displayId = ticket.display_id || `TICKET-${ticket.ticket_number || ticket.id}`
    const title = ticket.title || 'Untitled ticket'
    const branchName = generateBranchName(displayId, title)

    // Get base commit SHA
    const baseShaResult = await getRefSha(ghToken, repoFullName, defaultBranch)
    if ('error' in baseShaResult) {
      json(res, 500, {
        success: false,
        error: `Failed to get base commit SHA: ${baseShaResult.error}`,
      })
      return
    }
    const baseCommitSha = baseShaResult.sha

    // Create branch
    const branchResult = await createBranch(ghToken, repoFullName, branchName, defaultBranch)
    if ('error' in branchResult) {
      json(res, 500, {
        success: false,
        error: `Failed to create branch: ${branchResult.error}`,
      })
      return
    }
    const headCommitSha = branchResult.sha

    // Create draft PR
    const prTitle = `${displayId}: ${title}`
    const prBody = `Draft PR for ticket ${displayId}.\n\nThis PR was automatically created by HAL.`
    const prResult = await createDraftPullRequest(
      ghToken,
      repoFullName,
      prTitle,
      prBody,
      branchName,
      defaultBranch
    )

    if ('error' in prResult) {
      json(res, 500, {
        success: false,
        error: `Failed to create PR: ${prResult.error}`,
      })
      return
    }

    const pr = prResult.pr

    // Update ticket with PR metadata
    const updateResult = await supabase
      .from('tickets')
      .update({
        pr_url: pr.html_url,
        pr_number: pr.number,
        branch_name: branchName,
        base_commit_sha: pr.base.sha,
        head_commit_sha: pr.head.sha,
      })
      .eq('pk', ticket.pk)

    if (updateResult.error) {
      // PR was created but ticket update failed - log warning but return success
      console.warn(`PR created but ticket update failed: ${updateResult.error.message}`)
    }

    json(res, 200, {
      success: true,
      pr_url: pr.html_url,
      pr_number: pr.number,
      branch_name: branchName,
      base_commit_sha: pr.base.sha,
      head_commit_sha: pr.head.sha,
      base_branch: defaultBranch,
      message: 'PR created successfully.',
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err) },
    )
  }
}

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole, readJsonBody, json, fetchTicketByPkOrId } from './_shared.js'
import { getSession } from '../_lib/github/session.js'
import { createDraftPullRequest } from '../_lib/github/pullRequests.js'
import { listBranches, type GithubRepo } from '../_lib/github/repos.js'
import { githubFetch } from '../_lib/github/client.js'
import { slugFromTitle } from './_shared.js'

/**
 * Generate branch name from ticket info.
 * Format: ticket/{ticketNumber}-{slug}
 * Example: ticket/0771-automation-create-feature-branch-draft-pr-immediately
 */
function generateBranchName(ticketNumber: string, title: string): string {
  const slug = slugFromTitle(title)
  // Remove leading zeros from ticket number for branch name
  const ticketNum = ticketNumber.replace(/^0+/, '') || ticketNumber
  return `ticket/${ticketNum}-${slug}`
}

/**
 * Create a branch from the default branch (if it doesn't exist).
 * Returns the branch name or error.
 */
async function ensureBranch(
  token: string,
  repoFullName: string,
  branchName: string,
  defaultBranch: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }

    // Check if branch already exists
    const branchesResult = await listBranches(token, repoFullName)
    if ('error' in branchesResult) {
      return { error: `Failed to list branches: ${branchesResult.error}` }
    }
    if (branchesResult.branches.some((b) => b.name === branchName)) {
      return { ok: true } // Branch already exists
    }

    // Get the SHA of the default branch
    const refUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(defaultBranch)}`
    const refData = await githubFetch<{ object: { sha: string } }>(token, refUrl, { method: 'GET' })

    // Create the new branch
    const createRefUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`
    await githubFetch<{ ref: string }>(token, createRefUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      }),
    })

    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Get repository default branch.
 */
async function getRepoDefaultBranch(
  token: string,
  repoFullName: string
): Promise<{ defaultBranch: string } | { error: string }> {
  try {
    const [owner, repo] = repoFullName.split('/')
    if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    const data = await githubFetch<GithubRepo>(token, url, { method: 'GET' })
    return { defaultBranch: data.default_branch }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
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
    json(res, 405, { success: false, error: 'Method Not Allowed' })
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

    if ((!ticketId && !ticketPk) || !supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId, plus supabaseUrl and supabaseAnonKey are required.',
      })
      return
    }

    // Get GitHub token from session or env
    const session = await getSession(req, res).catch(() => null)
    const ghToken =
      process.env.GITHUB_TOKEN?.trim() || session?.github?.accessToken || undefined

    if (!ghToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required. Please connect your GitHub account.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket
    const ticketFetch = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)
    if (ticketFetch?.error || !ticketFetch?.data) {
      json(res, 404, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticket = ticketFetch.data
    const ticketPkValue = ticket.pk || ticketPk
    const repoFullName = ticket.repo_full_name

    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'Ticket does not have a repository associated.',
      })
      return
    }

    // Check if PR already exists
    if (ticket.pr_url) {
      json(res, 200, {
        success: true,
        prUrl: ticket.pr_url,
        message: 'PR already exists for this ticket.',
      })
      return
    }

    // Get ticket title and number
    const ticketNumber = String(ticket.ticket_number || ticket.id || '').padStart(4, '0')
    const title = ticket.title || `Ticket ${ticketNumber}`
    const displayId = ticket.display_id || `HAL-${ticketNumber}`

    // Generate branch name
    const branchName = generateBranchName(ticketNumber, title)

    // Get default branch
    const defaultBranchResult = await getRepoDefaultBranch(ghToken, repoFullName)
    if ('error' in defaultBranchResult) {
      json(res, 500, {
        success: false,
        error: `Failed to get repository default branch: ${defaultBranchResult.error}`,
      })
      return
    }
    const defaultBranch = defaultBranchResult.defaultBranch

    // Ensure branch exists
    const branchResult = await ensureBranch(ghToken, repoFullName, branchName, defaultBranch)
    if ('error' in branchResult) {
      json(res, 500, {
        success: false,
        error: `Failed to create branch: ${branchResult.error}`,
      })
      return
    }

    // Create draft PR
    const prTitle = `[Draft] ${displayId}: ${title}`
    const prBody = `Draft PR for ticket ${displayId}.\n\nThis PR was automatically created.`
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

    // Update ticket with PR URL
    const updateResult = await supabase
      .from('tickets')
      .update({ pr_url: pr.html_url })
      .eq('pk', ticketPkValue)

    if (updateResult.error) {
      json(res, 500, {
        success: false,
        error: `PR created but failed to update ticket: ${updateResult.error.message}`,
        prUrl: pr.html_url, // Still return PR URL even if update failed
      })
      return
    }

    json(res, 200, {
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branchName,
      baseBranch: defaultBranch,
      baseCommitSha: pr.base.sha,
      headCommitSha: pr.head.sha,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

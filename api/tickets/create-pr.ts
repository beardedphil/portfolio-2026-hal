import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import { createBranch, createDraftPullRequest, listBranches } from '../_lib/github/index.js'
import { parseSupabaseCredentials, json, validateMethod } from './_shared.js'
import { createClient } from '@supabase/supabase-js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/** Generate branch name from ticket ID and title */
function generateBranchName(ticketId: string, title: string): string {
  // Extract numeric part from ticket ID (e.g., "0771" from "HAL-0771" or "0771")
  const numericId = ticketId.replace(/^[A-Z]+-/, '').replace(/^0+/, '') || ticketId.replace(/^[A-Z]+-/, '')
  
  // Create slug from title (lowercase, replace spaces/special chars with hyphens, limit length)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
  
  return `ticket/${numericId.padStart(4, '0')}-${slug}`
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

  if (!validateMethod(req, res, 'POST')) return

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      repoFullName?: string
      defaultBranch?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const defaultBranch = typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() || 'main' : 'main'
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, { success: false, error: 'ticketPk (preferred) or ticketId is required.' })
      return
    }

    if (!repoFullName) {
      json(res, 400, { success: false, error: 'repoFullName is required.' })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    // Get GitHub session
    const session = await getSession(req)
    if (!session || !session.accessToken) {
      json(res, 401, { success: false, error: 'GitHub authentication required. Please connect your GitHub account.' })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket to get title
    const ticketQuery = ticketPk
      ? supabase.from('tickets').select('*').eq('pk', ticketPk).maybeSingle()
      : supabase.from('tickets').select('*').eq('display_id', ticketId!).maybeSingle()
    
    const { data: ticket, error: ticketError } = await ticketQuery

    if (ticketError || !ticket) {
      json(res, 404, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    // Check if PR already exists
    if (ticket.github_pr_url) {
      json(res, 200, {
        success: true,
        prUrl: ticket.github_pr_url,
        prNumber: ticket.github_pr_number,
        branchName: ticket.github_branch_name,
        message: 'PR already exists for this ticket.',
      })
      return
    }

    // Generate branch name
    const branchName = generateBranchName(ticket.display_id || ticket.id, ticket.title)

    // Check if branch already exists
    const branchesResult = await listBranches(session.accessToken, repoFullName)
    if ('error' in branchesResult) {
      json(res, 500, { success: false, error: `Failed to list branches: ${branchesResult.error}` })
      return
    }

    const branchExists = branchesResult.branches.some((b) => b.name === branchName)
    let branchCreated = false

    if (!branchExists) {
      // Create branch
      const branchResult = await createBranch(session.accessToken, repoFullName, branchName, defaultBranch)
      if ('error' in branchResult) {
        json(res, 500, { success: false, error: `Failed to create branch: ${branchResult.error}` })
        return
      }
      branchCreated = true
    }

    // Create draft PR
    const prTitle = `[${ticket.display_id || ticket.id}] ${ticket.title}`
    const prBody = `Draft PR for ticket ${ticket.display_id || ticket.id}.\n\nThis PR was automatically created by HAL.`
    
    const prResult = await createDraftPullRequest(
      session.accessToken,
      repoFullName,
      prTitle,
      branchName,
      defaultBranch,
      prBody
    )

    if ('error' in prResult) {
      json(res, 500, { success: false, error: `Failed to create PR: ${prResult.error}` })
      return
    }

    const pr = prResult.pr

    // Update ticket with PR info
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        github_pr_url: pr.html_url,
        github_pr_number: pr.number,
        github_branch_name: branchName,
        github_base_commit_sha: pr.base.sha,
        github_head_commit_sha: pr.head.sha,
      })
      .eq('pk', ticket.pk)

    if (updateError) {
      // PR was created but we couldn't update the ticket - still return success with PR info
      console.error('Failed to update ticket with PR info:', updateError)
    }

    json(res, 200, {
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branchName,
      baseBranch: defaultBranch,
      baseCommitSha: pr.base.sha,
      headCommitSha: pr.head.sha,
      branchCreated,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

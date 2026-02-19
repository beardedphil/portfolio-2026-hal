import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole } from './_shared.js'
import { getSession } from '../_lib/github/session.js'
import { getDefaultBranch, getBranchSha, createBranch } from '../_lib/github/repos.js'
import { createDraftPullRequest } from '../_lib/github/pullRequests.js'
import { slugFromTitle } from './_shared.js'

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

/**
 * Generate branch name from ticket: ticket/0771-automation-create-feature-branch-draft-pr-immediately
 * Format: ticket/{ticketNumber}-{slug-from-title}
 */
function generateBranchName(ticketNumber: string, title: string): string {
  const numericPart = ticketNumber.replace(/^[A-Z]+-/, '').replace(/^0+/, '') || ticketNumber
  const slug = slugFromTitle(title)
  return `ticket/${numericPart.padStart(4, '0')}-${slug}`
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

    // Get GitHub token from session
    const session = await getSession(req, res).catch(() => null)
    const ghToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim()
    if (!ghToken) {
      json(res, 401, {
        success: false,
        error: 'GitHub authentication required. Please sign in with GitHub.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket
    const ticketFetch = ticketPk
      ? await supabase.from('tickets').select('*').eq('pk', ticketPk).maybeSingle()
      : await supabase.from('tickets').select('*').eq('id', ticketId!).maybeSingle()

    if (ticketFetch.error) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch ticket: ${ticketFetch.error.message}`,
      })
      return
    }

    if (!ticketFetch.data) {
      json(res, 404, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticket = ticketFetch.data
    const repoFullName = (ticket as any).repo_full_name as string | null
    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'Ticket does not have a repository associated.',
      })
      return
    }

    const ticketNumber = (ticket as any).id as string
    const displayId = (ticket as any).display_id as string | undefined
    const title = (ticket as any).title as string
    const ticketPkValue = ticket.pk || ticketPk

    // Check if PR already exists (check agent_runs for pr_url)
    const { data: existingRun } = await supabase
      .from('hal_agent_runs')
      .select('pr_url')
      .eq('ticket_pk', ticketPkValue)
      .not('pr_url', 'is', null)
      .maybeSingle()

    if (existingRun && (existingRun as any).pr_url) {
      const prUrl = (existingRun as any).pr_url as string
      // Parse PR URL to get number
      const prMatch = prUrl.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i)
      const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0
      
      // Get default branch for base branch info
      const defaultBranchResult = await getDefaultBranch(ghToken, repoFullName)
      const defaultBranch = defaultBranchResult && 'branch' in defaultBranchResult ? defaultBranchResult.branch : 'main'
      
      // Generate branch name (same logic as creation)
      const branchName = generateBranchName(displayId || ticketNumber, title)
      
      // Try to get branch SHA
      const headShaResult = await getBranchSha(ghToken, repoFullName, branchName).catch(() => null)
      const headSha = headShaResult && 'sha' in headShaResult ? headShaResult.sha : ''
      
      // Get base SHA
      const baseShaResult = await getBranchSha(ghToken, repoFullName, defaultBranch).catch(() => null)
      const baseSha = baseShaResult && 'sha' in baseShaResult ? baseShaResult.sha : ''
      
      json(res, 200, {
        success: true,
        prUrl,
        prNumber,
        branchName,
        baseBranch: defaultBranch,
        baseSha,
        headSha,
        message: 'PR already exists for this ticket.',
      })
      return
    }

    // Get default branch
    const defaultBranchResult = await getDefaultBranch(ghToken, repoFullName)
    if ('error' in defaultBranchResult) {
      json(res, 500, {
        success: false,
        error: `Failed to get default branch: ${defaultBranchResult.error}`,
      })
      return
    }
    const defaultBranch = defaultBranchResult.branch

    // Get base branch SHA
    const baseShaResult = await getBranchSha(ghToken, repoFullName, defaultBranch)
    if ('error' in baseShaResult) {
      json(res, 500, {
        success: false,
        error: `Failed to get base branch SHA: ${baseShaResult.error}`,
      })
      return
    }
    const baseSha = baseShaResult.sha

    // Generate branch name
    const branchName = generateBranchName(displayId || ticketNumber, title)

    // Check if branch already exists
    const branchShaResult = await getBranchSha(ghToken, repoFullName, branchName).catch(() => null)
    let headSha: string
    if (branchShaResult && 'sha' in branchShaResult) {
      // Branch exists, use its SHA
      headSha = branchShaResult.sha
    } else {
      // Create branch
      const createBranchResult = await createBranch(ghToken, repoFullName, branchName, baseSha)
      if ('error' in createBranchResult) {
        json(res, 500, {
          success: false,
          error: `Failed to create branch: ${createBranchResult.error}`,
        })
        return
      }
      headSha = createBranchResult.sha
    }

    // Create draft PR
    const prTitle = `${displayId || ticketNumber}: ${title}`
    const prBody = `Draft PR for ticket ${displayId || ticketNumber}.\n\nThis PR was automatically created by HAL.`
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

    // Store PR info in agent_runs (or update existing run)
    const { data: runData } = await supabase
      .from('hal_agent_runs')
      .select('run_id')
      .eq('ticket_pk', ticketPkValue)
      .maybeSingle()

    if (runData) {
      // Update existing run
      await supabase
        .from('hal_agent_runs')
        .update({ pr_url: pr.html_url })
        .eq('run_id', (runData as any).run_id)
    } else {
      // Create new run record (minimal)
      await supabase.from('hal_agent_runs').insert({
        ticket_pk: ticketPkValue,
        ticket_number: ticketNumber,
        display_id: displayId || ticketNumber,
        repo_full_name: repoFullName,
        agent_type: 'implementation',
        status: 'running',
        pr_url: pr.html_url,
      })
    }

    json(res, 200, {
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branchName,
      baseBranch: defaultBranch,
      baseSha,
      headSha: pr.head.sha,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

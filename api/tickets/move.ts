import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  getMissingRequiredImplementationArtifacts,
  hasMissingArtifactExplanation,
  type ArtifactRowForCheck,
} from '../artifacts/_shared.js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole, fetchTicketByPkOrId } from './_shared.js'
import { resolveColumnId, calculateTargetPosition } from './_move-helpers.js'
import { getSession } from '../_lib/github/session.js'
import { createBranch, createDraftPullRequest, listBranches } from '../_lib/github/index.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests (for scripts calling from different origins)
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
      columnId?: string
      columnName?: string
      position?: string | number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    let columnId = typeof body.columnId === 'string' ? body.columnId.trim() || undefined : undefined
    const columnName = typeof body.columnName === 'string' ? body.columnName.trim() || undefined : undefined
    const position = body.position
    // Use service role key (preferred) to bypass RLS, fall back to anon key if not available
    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!columnId && !columnName) {
      json(res, 400, {
        success: false,
        error: 'columnId or columnName is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Resolve column name to column ID if needed
    if (!columnId && columnName) {
      const resolved = await resolveColumnId(supabase, undefined, columnName)
      if (!resolved) {
        const { data: columns } = await supabase.from('kanban_columns').select('title')
        json(res, 200, {
          success: false,
          error: `Column "${columnName}" not found. Available columns: ${(columns || []).map((c: any) => c.title).join(', ')}`,
        })
        return
      }
      columnId = resolved.id
    }

    // Fetch current ticket to get repo_full_name for scoped queries
    // Try multiple lookup strategies to handle different ticket ID formats
    const ticketFetch = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)

    if (!ticketFetch || ticketFetch.error || !ticketFetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.${ticketFetch?.error ? ` Error: ${ticketFetch.error.message}` : ''}`,
      })
      return
    }

    const ticket = ticketFetch.data
    const repoFullName = (ticket as any).repo_full_name || ''
    const currentColumnId = (ticket as any).kanban_column_id
    const resolvedTicketPk = (ticket as any).pk as string

    // Gate: prevent moving tickets from To Do to beyond-To-Do columns without a linked PR (HAL-0772)
    // If no PR exists, automatically create one (HAL-0771)
    const columnsBeyondTodo = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-done']
    if (currentColumnId === 'col-todo' && columnId && columnsBeyondTodo.includes(columnId) && resolvedTicketPk) {
      // First check if ticket has a PR in the tickets table (new field from HAL-0771)
      let hasPr = false
      let prUrl: string | null = null
      
      if ((ticket as any).github_pr_url) {
        hasPr = true
        prUrl = (ticket as any).github_pr_url
      } else {
        // Fallback: check agent runs for PR
        const { data: agentRuns, error: runsErr } = await supabase
          .from('hal_agent_runs')
          .select('pr_url')
          .eq('ticket_pk', resolvedTicketPk)
          .not('pr_url', 'is', null)

        if (runsErr) {
          json(res, 200, {
            success: false,
            error: `Cannot move ticket: failed to check for linked PR (${runsErr.message}).`,
          })
          return
        }

        // Check if any agent run has a non-empty PR URL
        const runWithPr = agentRuns?.find((run: any) => {
          const url = run.pr_url
          return url && typeof url === 'string' && url.trim().length > 0
        })
        
        if (runWithPr) {
          hasPr = true
          prUrl = runWithPr.pr_url
        }
      }

      // If no PR exists, automatically create one
      if (!hasPr) {
        // Ensure we have repo_full_name
        if (!repoFullName || repoFullName.trim() === '') {
          json(res, 200, {
            success: false,
            error: 'Cannot create PR: ticket is missing repo_full_name.',
          })
          return
        }

        // Get GitHub session for PR creation
        const session = await getSession(req)
        if (!session || !session.accessToken) {
          json(res, 200, {
            success: false,
            error: 'No PR associated and GitHub authentication required to create one automatically.',
            errorCode: 'NO_PR_ASSOCIATED',
            remedy: 'Please connect your GitHub account to enable automatic PR creation, or manually create a PR and link it to this ticket.',
          })
          return
        }

        // Generate branch name from ticket
        const generateBranchName = (ticketId: string, title: string): string => {
          const numericId = ticketId.replace(/^[A-Z]+-/, '').replace(/^0+/, '') || ticketId.replace(/^[A-Z]+-/, '')
          const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50)
          return `ticket/${numericId.padStart(4, '0')}-${slug}`
        }

        const branchName = generateBranchName(ticket.display_id || ticket.id, ticket.title)
        const defaultBranch = 'main' // Could be made configurable per repo

        // Check if branch already exists
        const branchesResult = await listBranches(session.accessToken, repoFullName)
        if ('error' in branchesResult) {
          json(res, 200, {
            success: false,
            error: `Failed to create PR: could not list branches (${branchesResult.error}).`,
          })
          return
        }

        const branchExists = branchesResult.branches.some((b) => b.name === branchName)

        if (!branchExists) {
          // Create branch
          const branchResult = await createBranch(session.accessToken, repoFullName, branchName, defaultBranch)
          if ('error' in branchResult) {
            json(res, 200, {
              success: false,
              error: `Failed to create PR: could not create branch (${branchResult.error}).`,
            })
            return
          }
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
          json(res, 200, {
            success: false,
            error: `Failed to create PR: ${prResult.error}.`,
          })
          return
        }

        const pr = prResult.pr
        prUrl = pr.html_url

        // Update ticket with PR info
        await supabase
          .from('tickets')
          .update({
            github_pr_url: pr.html_url,
            github_pr_number: pr.number,
            github_branch_name: branchName,
            github_base_commit_sha: pr.base.sha,
            github_head_commit_sha: pr.head.sha,
          })
          .eq('pk', resolvedTicketPk)
      }
    }

    // Gate: moving to Ready for QA requires all 8 implementation artifacts (substantive)
    // OR a "Missing Artifact Explanation" artifact if artifacts are missing (0200)
    if (columnId === 'col-qa' && resolvedTicketPk) {
      const { data: artifactRows, error: artErr } = await supabase
        .from('agent_artifacts')
        .select('title, agent_type, body_md')
        .eq('ticket_pk', resolvedTicketPk)

      if (artErr) {
        json(res, 200, {
          success: false,
          error: `Cannot move to Ready for QA: failed to check artifacts (${artErr.message}).`,
        })
        return
      }

      const artifactsForCheck: ArtifactRowForCheck[] = (artifactRows || []).map((r: any) => ({
        title: r.title,
        agent_type: r.agent_type,
        body_md: r.body_md,
      }))

      const implementationArtifacts = artifactsForCheck.filter((a) => a.agent_type === 'implementation')
      const missingArtifacts = getMissingRequiredImplementationArtifacts(implementationArtifacts)

      if (missingArtifacts.length > 0 && !hasMissingArtifactExplanation(artifactsForCheck)) {
        json(res, 200, {
          success: false,
          error:
            'Cannot move to Ready for QA: missing required implementation artifacts. You must add a "Missing Artifact Explanation" artifact that explains which artifact(s) are missing and why they were intentionally not created.',
          missingArtifacts,
          remedy:
            'Add a "Missing Artifact Explanation" artifact via POST /api/artifacts/insert-implementation with artifactType "missing-artifact-explanation" and title "Missing Artifact Explanation". The artifact body_md must explain which artifact(s) are missing and why they were intentionally not created. Then retry POST /api/tickets/move.',
        })
        return
      }
    }

    if (!columnId) {
      json(res, 400, { success: false, error: 'Column ID is required but was not resolved.' })
      return
    }

    let targetPosition: number
    try {
      targetPosition = (
        await calculateTargetPosition(supabase, columnId, repoFullName, resolvedTicketPk, currentColumnId, position)
      ).position
    } catch (err) {
      json(res, 400, { success: false, error: err instanceof Error ? err.message : String(err) })
      return
    }

    const ticketPkToUse = ticketPk || resolvedTicketPk
    if (!ticketPkToUse) {
      json(res, 200, { success: false, error: 'Could not determine ticket PK for update.' })
      return
    }

    const movedAt = new Date().toISOString()

    const update = await supabase
      .from('tickets')
      .update({
        kanban_column_id: columnId,
        kanban_position: targetPosition,
        kanban_moved_at: movedAt,
      })
      .eq('pk', ticketPkToUse)

    if (update.error) {
      json(res, 200, {
        success: false,
        error: `Supabase update failed: ${update.error.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      position: targetPosition,
      movedAt,
      columnId,
      columnName: columnName || undefined,
    })
  } catch (err) {
    console.error('[api/tickets/move] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined
    if (!res.headersSent) {
      json(res, 500, { 
        success: false, 
        error: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        details: err instanceof Error ? {
          name: err.name,
          message: err.message,
        } : undefined
      })
    }
  }
}

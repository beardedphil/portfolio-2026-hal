import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  getMissingRequiredImplementationArtifacts,
  hasMissingArtifactExplanation,
  type ArtifactRowForCheck,
} from '../artifacts/_shared.js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole, fetchTicketByPkOrId } from './_shared.js'
import { resolveColumnId, calculateTargetPosition } from './_move-helpers.js'
import { parseAcceptanceCriteria } from './_acceptance-criteria-parser.js'
import { evaluateCiStatus, type CiStatusSummary } from '../_lib/github/checks.js'
import { getSession } from '../_lib/github/session.js'
import { checkDocsConsistency, type DocsConsistencyResult } from './_docs-consistency-check.js'

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
      /**
       * When true, allow moving from To-do -> Doing without a linked PR.
       * This is intended for "start implementation" flows where the Implementation Agent
       * is configured to auto-create the PR during the run.
       */
      allowWithoutPr?: boolean
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    let columnId = typeof body.columnId === 'string' ? body.columnId.trim() || undefined : undefined
    const columnName = typeof body.columnName === 'string' ? body.columnName.trim() || undefined : undefined
    const position = body.position
    const allowWithoutPr = body.allowWithoutPr === true
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

    // Helper function to get column title from ID
    const getColumnTitle = async (colId: string | null | undefined): Promise<string | null> => {
      if (!colId) return null
      const { data: col } = await supabase.from('kanban_columns').select('title').eq('id', colId).single()
      return col?.title || null
    }

    // Helper function to format transition name
    const formatTransition = async (fromColId: string | null | undefined, toColId: string | null | undefined): Promise<string | null> => {
      const fromTitle = fromColId ? await getColumnTitle(fromColId) : null
      const toTitle = toColId ? await getColumnTitle(toColId) : null
      if (!fromTitle && !toTitle) return null
      if (!fromTitle) return `→ ${toTitle}`
      if (!toTitle) return `${fromTitle} →`
      return `${fromTitle} → ${toTitle}`
    }

    // Gate: prevent moving tickets from To Do to beyond-To-Do columns without a linked PR (HAL-0772)
    const columnsBeyondTodo = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-done']
    const isTodoToDoingAllowlisted = allowWithoutPr && columnId === 'col-doing'
    if (
      currentColumnId === 'col-todo' &&
      columnId &&
      columnsBeyondTodo.includes(columnId) &&
      resolvedTicketPk &&
      !isTodoToDoingAllowlisted
    ) {
      // Check if ticket has a linked PR via agent runs
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
      const hasPr = agentRuns && agentRuns.length > 0 && agentRuns.some((run: any) => {
        const prUrl = run.pr_url
        return prUrl && typeof prUrl === 'string' && prUrl.trim().length > 0
      })

      if (!hasPr) {
        json(res, 200, {
          success: false,
          error: 'No PR associated',
          errorCode: 'NO_PR_ASSOCIATED',
          remedy: 'A GitHub Pull Request must be linked to this ticket before it can be moved beyond To Do. Create a PR or link an existing PR to continue.',
        })
        return
      }
    }

    // Gate: moving to To Do requires a RED document (HAL-0793)
    if (columnId === 'col-todo' && resolvedTicketPk && repoFullName) {
      // Prefer the latest *validated* RED (Option A), but fall back to "any RED exists"
      // to avoid blocking when validation infrastructure isn't migrated yet.
      let hasValidRed = false
      let rpcError: string | null = null
      try {
        const { data: redData, error: redErr } = await supabase.rpc('get_latest_valid_red', {
          p_repo_full_name: repoFullName,
          p_ticket_pk: resolvedTicketPk,
        })
        if (redErr) rpcError = redErr.message
        else hasValidRed = Array.isArray(redData) && redData.length > 0
      } catch (e) {
        rpcError = e instanceof Error ? e.message : String(e)
      }

      if (!hasValidRed) {
        const { data: anyRed, error: anyRedErr } = await supabase
          .from('hal_red_documents')
          .select('red_id')
          .eq('repo_full_name', repoFullName)
          .eq('ticket_pk', resolvedTicketPk)
          .limit(1)
        if (anyRedErr) {
          json(res, 200, {
            success: false,
            error: `Cannot move to To Do: failed to check for RED document (${rpcError || anyRedErr.message}).`,
          })
          return
        }
        if (!anyRed || anyRed.length === 0) {
          json(res, 200, {
            success: false,
            error: 'Cannot move to To Do: RED document is required. Create a RED document first.',
          })
          return
        }
        // RED exists (even if not validated) — allow move to To Do.
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

    // Gate: Drift gate - block transitions beyond To Do when AC are unmet, tests are failing, or docs are inconsistent (HAL-0753)
    // Check for unmet ACs, failing CI, and docs inconsistencies when moving beyond To Do
    // Transitions beyond To Do: To Do → Doing, To Do → QA, Doing → QA, QA → HITL, HITL → Done
    const columnsBeyondTodo = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-process-review', 'col-done']
    const isTransitionBeyondTodo = 
      (currentColumnId === 'col-todo' && columnId && columnsBeyondTodo.includes(columnId)) ||
      (columnId && columnsBeyondTodo.includes(columnId) && currentColumnId !== 'col-todo')
    
    if (isTransitionBeyondTodo && resolvedTicketPk) {
      // Format transition name
      const transitionName = await formatTransition(currentColumnId, columnId)
      
      // Collect all failure reasons from all three checks
      const failureReasons: Array<{ type: string; message: string }> = []
      const driftResults: {
        acCheck?: { passed: boolean; unmetCount?: number; unmetIndices?: number[]; unmetTexts?: string }
        ciCheck?: { passed: boolean; overall?: string; failingCheckNames?: string[]; checksPageUrl?: string; error?: string }
        docsCheck?: { passed: boolean; findings?: Array<{ path: string; ruleId: string; message: string }>; error?: string }
      } = {}
      
      // 1. Check Acceptance Criteria status
      const acItems = parseAcceptanceCriteria((ticket as any).body_md || null)
      if (acItems.length > 0) {
        const { data: acStatusRecords, error: acStatusErr } = await supabase
          .from('acceptance_criteria_status')
          .select('ac_index, status')
          .eq('ticket_pk', resolvedTicketPk)
          .eq('status', 'unmet')

        if (acStatusErr) {
          failureReasons.push({
            type: 'AC_CHECK_ERROR',
            message: `Failed to check AC status: ${acStatusErr.message}`,
          })
          driftResults.acCheck = { passed: false, error: acStatusErr.message }
        } else if (acStatusRecords && acStatusRecords.length > 0) {
          const unmetIndices = acStatusRecords.map((r: any) => r.ac_index).sort((a, b) => a - b)
          const unmetTexts = unmetIndices
            .map((idx: number) => {
              const item = acItems[idx]
              return item ? `  ${idx + 1}. ${item.text}` : null
            })
            .filter(Boolean)
            .join('\n')
          
          failureReasons.push({
            type: 'UNMET_AC',
            message: `${acStatusRecords.length} acceptance criteria item(s) are marked as unmet`,
          })
          driftResults.acCheck = { 
            passed: false, 
            unmetCount: acStatusRecords.length, 
            unmetIndices,
            unmetTexts 
          }
        } else {
          driftResults.acCheck = { passed: true }
        }
      } else {
        // No AC items - consider check passed
        driftResults.acCheck = { passed: true }
      }

      // 2. Check CI status (requires PR)
      const { data: agentRuns, error: runsErr } = await supabase
        .from('hal_agent_runs')
        .select('pr_url')
        .eq('ticket_pk', resolvedTicketPk)
        .not('pr_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)

      let prUrl: string | null = null
      let evaluatedHeadSha: string | null = null

      if (runsErr) {
        failureReasons.push({
          type: 'CI_CHECK_ERROR',
          message: `Failed to check for linked PR: ${runsErr.message}`,
        })
        driftResults.ciCheck = { passed: false, error: runsErr.message }
      } else {
        prUrl = agentRuns && agentRuns.length > 0 && agentRuns[0]?.pr_url
          ? String(agentRuns[0].pr_url).trim()
          : null

        if (!prUrl || prUrl.length === 0) {
          failureReasons.push({
            type: 'NO_PR_LINKED',
            message: 'A GitHub Pull Request must be linked to this ticket before it can be moved to this column.',
          })
          driftResults.ciCheck = { passed: false, error: 'No PR linked' }
        } else {
          // Evaluate CI status for the PR
          let ciStatus: CiStatusSummary | { error: string } | null = null
          let evaluationError: string | null = null

          try {
            const session = await getSession(req, res).catch(() => null)
            const ghToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()

            if (!ghToken) {
              evaluationError = 'GitHub authentication required to check CI status'
              ciStatus = { error: evaluationError }
            } else {
              ciStatus = await evaluateCiStatus(ghToken, prUrl)
              if ('error' in ciStatus) {
                evaluationError = ciStatus.error
              } else {
                evaluatedHeadSha = ciStatus.evaluatedSha
              }
            }
          } catch (err) {
            evaluationError = err instanceof Error ? err.message : String(err)
            ciStatus = { error: evaluationError }
          }

          if ('error' in ciStatus) {
            failureReasons.push({
              type: 'CI_EVALUATION_ERROR',
              message: evaluationError || 'Failed to evaluate CI status',
            })
            driftResults.ciCheck = { passed: false, error: evaluationError || 'Failed to evaluate CI status' }
          } else if (ciStatus.overall === 'failing') {
            if (ciStatus.failingCheckNames && ciStatus.failingCheckNames.length > 0) {
              ciStatus.failingCheckNames.forEach((checkName: string) => {
                failureReasons.push({
                  type: 'CI_CHECK_FAILED',
                  message: `CI check "${checkName}" is failing`,
                })
              })
            } else {
              failureReasons.push({
                type: 'CI_CHECKS_FAILING',
                message: 'Required CI checks are failing',
              })
            }
            driftResults.ciCheck = {
              passed: false,
              overall: ciStatus.overall,
              failingCheckNames: ciStatus.failingCheckNames,
              checksPageUrl: ciStatus.checksPageUrl,
            }
          } else {
            driftResults.ciCheck = {
              passed: true,
              overall: ciStatus.overall,
              checksPageUrl: ciStatus.checksPageUrl,
            }
          }
        }
      }

      // 3. Check docs consistency (reuse PR URL from CI check above)
      try {
        const session = await getSession(req, res).catch(() => null)
        const ghToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()

        const ticketId = (ticket as any).id || (ticket as any).display_id || ''
        const ticketFilename = (ticket as any).filename || null
        
        const docsResult = await checkDocsConsistency(
          ticketId,
          ticketFilename,
          (ticket as any).body_md || null,
          repoFullName,
          prUrl,
          ghToken
        )

        if (!docsResult.passed) {
          docsResult.findings.forEach((finding) => {
            failureReasons.push({
              type: 'DOCS_INCONSISTENT',
              message: `${finding.path}: ${finding.message}`,
            })
          })
          driftResults.docsCheck = {
            passed: false,
            findings: docsResult.findings,
          }
        } else {
          driftResults.docsCheck = { passed: true }
        }
      } catch (err) {
        const docsError = err instanceof Error ? err.message : String(err)
        failureReasons.push({
          type: 'DOCS_CHECK_ERROR',
          message: `Failed to check docs consistency: ${docsError}`,
        })
        driftResults.docsCheck = { passed: false, error: docsError }
      }

      // Build references object for drift attempt
      const references: any = {}
      if (prUrl) {
        references.pr_url = prUrl
      }
      if (evaluatedHeadSha) {
        references.head_sha = evaluatedHeadSha
      }

      // Determine if transition should be blocked
      const shouldBlock = failureReasons.length > 0

      // Store drift attempt record
      const driftAttemptData: any = {
        ticket_pk: resolvedTicketPk,
        transition: transitionName,
        pr_url: prUrl,
        references,
        blocked: shouldBlock,
        failure_reasons: failureReasons.length > 0 ? failureReasons : null,
      }

      // Add CI-specific fields if available
      if (evaluatedHeadSha) {
        driftAttemptData.evaluated_head_sha = evaluatedHeadSha
      }
      if (driftResults.ciCheck && !driftResults.ciCheck.error) {
        if (driftResults.ciCheck.overall) {
          driftAttemptData.overall_status = driftResults.ciCheck.overall
        }
        if (driftResults.ciCheck.failingCheckNames) {
          driftAttemptData.failing_check_names = driftResults.ciCheck.failingCheckNames
        }
        if (driftResults.ciCheck.checksPageUrl) {
          driftAttemptData.checks_page_url = driftResults.ciCheck.checksPageUrl
        }
      } else if (driftResults.ciCheck?.error) {
        driftAttemptData.evaluation_error = driftResults.ciCheck.error
      }

      // Add docs findings to references
      if (driftResults.docsCheck && !driftResults.docsCheck.passed && driftResults.docsCheck.findings) {
        references.docs_findings = driftResults.docsCheck.findings.map(f => ({
          path: f.path,
          ruleId: f.ruleId,
          message: f.message,
        }))
      }

      await supabase.from('drift_attempts').insert(driftAttemptData)

      // Block transition if any check failed
      if (shouldBlock) {
        // Build error message with all failures
        const errorParts: string[] = []
        const remedyParts: string[] = []

        if (driftResults.acCheck && !driftResults.acCheck.passed && driftResults.acCheck.unmetCount) {
          errorParts.push(`${driftResults.acCheck.unmetCount} acceptance criteria item(s) are marked as unmet`)
          remedyParts.push(`Mark all acceptance criteria as "Met" in the ticket details panel. Unmet items:\n${driftResults.acCheck.unmetTexts || ''}`)
        }

        if (driftResults.ciCheck && !driftResults.ciCheck.passed) {
          if (driftResults.ciCheck.error === 'No PR linked') {
            errorParts.push('No PR linked')
            remedyParts.push('Link a PR to this ticket before attempting this transition.')
          } else if (driftResults.ciCheck.failingCheckNames && driftResults.ciCheck.failingCheckNames.length > 0) {
            const failingChecksList = driftResults.ciCheck.failingCheckNames.map((name) => `  - ${name}`).join('\n')
            errorParts.push('CI checks are failing')
            remedyParts.push(`Fix the failing CI checks:\n${failingChecksList}\n\nView checks: ${driftResults.ciCheck.checksPageUrl || 'N/A'}`)
          } else if (driftResults.ciCheck.error) {
            errorParts.push(`CI check error: ${driftResults.ciCheck.error}`)
          }
        }

        if (driftResults.docsCheck && !driftResults.docsCheck.passed && driftResults.docsCheck.findings) {
          const inconsistentDocs = [...new Set(driftResults.docsCheck.findings.map(f => f.path))].join(', ')
          errorParts.push(`Documentation is inconsistent: ${inconsistentDocs}`)
          const docsDetails = driftResults.docsCheck.findings.map(f => `  - ${f.path}: ${f.message}`).join('\n')
          remedyParts.push(`Fix documentation inconsistencies:\n${docsDetails}`)
        }

        const errorMessage = errorParts.length > 0
          ? `Cannot move ticket: ${errorParts.join('; ')}. All drift checks must pass before moving to this column.`
          : 'Cannot move ticket: Drift checks failed. All drift checks must pass before moving to this column.'

        json(res, 200, {
          success: false,
          error: errorMessage,
          errorCode: 'DRIFT_CHECK_FAILED',
          driftResults,
          remedy: remedyParts.join('\n\n'),
        })
        return
      }
      
      // All checks passed - continue with the move
    }

    if (!columnId) {
      json(res, 400, { success: false, error: 'Column ID is required but was not resolved.' })
      return
    }

    // HAL-0791: When a ticket fails QA or HITL, move it to the top of To-do column
    // Detect failure-driven moves: from col-qa or col-human-in-the-loop to col-todo
    let effectivePosition = position
    const isFailureMove =
      columnId === 'col-todo' &&
      (currentColumnId === 'col-qa' || currentColumnId === 'col-human-in-the-loop') &&
      (position === undefined || position === null || position === '' || position === 'bottom')

    if (isFailureMove) {
      // Set position to 'top' to place failed ticket at position 0
      effectivePosition = 'top'
    }

    let targetPosition: number
    try {
      targetPosition = (
        await calculateTargetPosition(supabase, columnId, repoFullName, resolvedTicketPk, currentColumnId, effectivePosition)
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

    // Store drift attempt for successful transitions that didn't go through drift gate
    // (drift-gated transitions already stored their attempts above)
    const columnsBeyondTodo = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-process-review', 'col-done']
    const isTransitionBeyondTodo = 
      (currentColumnId === 'col-todo' && columnId && columnsBeyondTodo.includes(columnId)) ||
      (columnId && columnsBeyondTodo.includes(columnId) && currentColumnId !== 'col-todo')
    
    if (!isTransitionBeyondTodo) {
      const transitionName = await formatTransition(currentColumnId, columnId)
      if (transitionName && resolvedTicketPk) {
        // Store attempt record for non-drift-gated transitions (e.g., within To Do column)
        await supabase.from('drift_attempts').insert({
          ticket_pk: resolvedTicketPk,
          transition: transitionName,
          pr_url: null,
          evaluated_head_sha: null,
          overall_status: null,
          required_checks: null,
          failing_check_names: null,
          checks_page_url: null,
          evaluation_error: null,
          failure_reasons: null,
          references: {},
          blocked: false,
        })
      }
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

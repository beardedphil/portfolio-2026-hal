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
import { checkDocsConsistency, type DocsConsistencyResult, type DocsConsistencyFinding } from './_docs-consistency-check.js'
import { slugFromTitle } from './_shared.js'

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

    // Gate: Drift gate - block transitions when any AC is unmet (HAL-0765)
    // Check for unmet ACs when moving to columns that indicate completion/progress
    const driftGatedColumns = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-process-review', 'col-done']
    if (columnId && driftGatedColumns.includes(columnId) && resolvedTicketPk) {
      // Parse AC items from ticket body
      const acItems = parseAcceptanceCriteria((ticket as any).body_md || null)
      
      if (acItems.length > 0) {
        // Check for unmet AC status records
        const { data: acStatusRecords, error: acStatusErr } = await supabase
          .from('acceptance_criteria_status')
          .select('ac_index, status')
          .eq('ticket_pk', resolvedTicketPk)
          .eq('status', 'unmet')

        if (acStatusErr) {
          json(res, 200, {
            success: false,
            error: `Cannot move ticket: failed to check AC status (${acStatusErr.message}).`,
          })
          return
        }

        // If any AC item has status 'unmet', block the transition
        if (acStatusRecords && acStatusRecords.length > 0) {
          const unmetIndices = acStatusRecords.map((r: any) => r.ac_index).sort((a, b) => a - b)
          const unmetTexts = unmetIndices
            .map((idx: number) => {
              const item = acItems[idx]
              return item ? `  ${idx + 1}. ${item.text}` : null
            })
            .filter(Boolean)
            .join('\n')

          // Format transition name
          const transitionName = await formatTransition(currentColumnId, columnId)
          
          // Store drift attempt record for AC failure
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
            failure_reasons: [
              {
                type: 'UNMET_AC',
                message: `${acStatusRecords.length} acceptance criteria item(s) are marked as unmet`,
              },
            ],
            references: { unmet_indices: unmetIndices },
            blocked: true,
          })

          json(res, 200, {
            success: false,
            error: `Cannot move ticket: ${acStatusRecords.length} acceptance criteria item(s) are marked as unmet. All acceptance criteria must be met before moving to this column.`,
            errorCode: 'UNMET_AC_BLOCKER',
            unmetCount: acStatusRecords.length,
            unmetIndices,
            remedy: `Mark all acceptance criteria as "Met" in the ticket details panel before moving to ${columnId}. Unmet items:\n${unmetTexts}`,
          })
          return
        }

        // If ticket has AC items but no status records exist yet, allow the move
        // (AC status may not have been initialized yet, which is fine for v0)
      }

      // Gate: Drift gate CI awareness - check CI status for linked PR (HAL-0767)
      // Check if ticket has a linked PR
      const { data: agentRuns, error: runsErr } = await supabase
        .from('hal_agent_runs')
        .select('pr_url')
        .eq('ticket_pk', resolvedTicketPk)
        .not('pr_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)

      if (runsErr) {
        json(res, 200, {
          success: false,
          error: `Cannot move ticket: failed to check for linked PR (${runsErr.message}).`,
        })
        return
      }

      const prUrl = agentRuns && agentRuns.length > 0 && agentRuns[0]?.pr_url
        ? String(agentRuns[0].pr_url).trim()
        : null

      // If no PR linked, block the transition
      if (!prUrl || prUrl.length === 0) {
        // Format transition name
        const transitionName = await formatTransition(currentColumnId, columnId)
        
        // Store drift attempt record with normalized failure reasons
        await supabase.from('drift_attempts').insert({
          ticket_pk: resolvedTicketPk,
          transition: transitionName,
          pr_url: null,
          evaluated_head_sha: null,
          overall_status: null,
          required_checks: null,
          failing_check_names: null,
          checks_page_url: null,
          evaluation_error: 'No PR linked',
          failure_reasons: [
            { type: 'NO_PR_LINKED', message: 'A GitHub Pull Request must be linked to this ticket before it can be moved to this column.' }
          ],
          references: {},
          blocked: true,
        })

        json(res, 200, {
          success: false,
          error: 'A GitHub Pull Request must be linked to this ticket before it can be moved to this column.',
          errorCode: 'NO_PR_REQUIRED',
          remedy: 'Link a PR to this ticket before attempting this transition. The drift gate requires CI checks to pass before allowing transitions.',
        })
        return
      }

      // Evaluate CI status for the PR
      let ciStatus: CiStatusSummary | { error: string } | null = null
      let evaluationError: string | null = null

      try {
        // Get GitHub token from session or environment
        const session = await getSession(req, res).catch(() => null)
        const ghToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()

        if (!ghToken) {
          evaluationError = 'GitHub authentication required to check CI status'
          ciStatus = { error: evaluationError }
        } else {
          ciStatus = await evaluateCiStatus(ghToken, prUrl)
          if ('error' in ciStatus) {
            evaluationError = ciStatus.error
          }
        }
      } catch (err) {
        evaluationError = err instanceof Error ? err.message : String(err)
        ciStatus = { error: evaluationError }
      }

      // Format transition name
      const transitionName = await formatTransition(currentColumnId, columnId)
      
      // Build normalized failure reasons
      const failureReasons: Array<{ type: string; message: string }> = []
      if ('error' in ciStatus) {
        failureReasons.push({
          type: 'CI_EVALUATION_ERROR',
          message: evaluationError || 'Failed to evaluate CI status',
        })
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
      }

      // Build references object
      const references: any = {
        pr_url: prUrl,
      }
      if (!('error' in ciStatus) && ciStatus.evaluatedSha) {
        references.head_sha = ciStatus.evaluatedSha
      }

      // Store drift attempt record
      const driftAttemptData: any = {
        ticket_pk: resolvedTicketPk,
        transition: transitionName,
        pr_url: prUrl,
        references,
        blocked: false,
        failure_reasons: failureReasons.length > 0 ? failureReasons : null,
      }

      if ('error' in ciStatus) {
        driftAttemptData.evaluation_error = evaluationError
        driftAttemptData.blocked = true
      } else {
        driftAttemptData.evaluated_head_sha = ciStatus.evaluatedSha
        driftAttemptData.overall_status = ciStatus.overall
        driftAttemptData.required_checks = ciStatus.requiredChecks
        driftAttemptData.failing_check_names = ciStatus.failingCheckNames
        driftAttemptData.checks_page_url = ciStatus.checksPageUrl
        driftAttemptData.blocked = ciStatus.overall === 'failing'
      }

      await supabase.from('drift_attempts').insert(driftAttemptData)

      // Block transition if CI is failing
      if (!('error' in ciStatus) && ciStatus.overall === 'failing') {
        const failingChecksList = ciStatus.failingCheckNames.length > 0
          ? ciStatus.failingCheckNames.map((name) => `  - ${name}`).join('\n')
          : '  - Required checks (unit and/or e2e) are failing'

        json(res, 200, {
          success: false,
          error: `Cannot move ticket: CI checks are failing. All required checks must pass before moving to this column.`,
          errorCode: 'CI_CHECKS_FAILING',
          ciStatus: {
            overall: ciStatus.overall,
            evaluatedSha: ciStatus.evaluatedSha,
            failingCheckNames: ciStatus.failingCheckNames,
            checksPageUrl: ciStatus.checksPageUrl,
          },
          remedy: `Fix the failing CI checks and ensure all required checks (unit and e2e) pass before moving to ${columnId}.\n\nFailing checks:\n${failingChecksList}\n\nView checks: ${ciStatus.checksPageUrl}`,
        })
        return
      }

      // If CI evaluation failed (e.g., no auth), still allow the move but log the error
      // This prevents blocking users when GitHub API is unavailable
      if ('error' in ciStatus) {
        console.warn(`[drift-gate] CI evaluation failed for ticket ${resolvedTicketPk}: ${evaluationError}`)
        // Continue with the move - don't block on CI evaluation errors
      }

      // Gate: Drift gate docs consistency check (HAL-0768)
      // Check if docs are inconsistent with code
      let docsCheckResult: DocsConsistencyResult | null = null
      let docsCheckError: string | null = null

      try {
        // Get GitHub token for docs check
        const session = await getSession(req, res).catch(() => null)
        const ghToken = session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()

        // Construct ticket filename
        const ticketFilename = ticketId
          ? `${ticketId.padStart(4, '0')}-${slugFromTitle((ticket as any).title || 'ticket')}.md`
          : null

        // Run docs consistency check
        docsCheckResult = await checkDocsConsistency(
          ticketId || resolvedTicketPk,
          ticketFilename,
          (ticket as any).body_md || null,
          repoFullName,
          prUrl,
          ghToken
        )
      } catch (err) {
        docsCheckError = err instanceof Error ? err.message : String(err)
        console.warn(`[drift-gate] Docs consistency check failed for ticket ${resolvedTicketPk}: ${docsCheckError}`)
        // Continue with the move - don't block on docs check errors
      }

      // If docs check found inconsistencies, block the transition
      if (docsCheckResult && !docsCheckResult.passed && docsCheckResult.findings.length > 0) {
        // Format transition name
        const transitionName = await formatTransition(currentColumnId, columnId)

        // Build failure reasons for docs inconsistencies
        const docsFailureReasons: Array<{ type: string; message: string }> = []
        const docsFindingsByPath = new Map<string, DocsConsistencyFinding[]>()
        for (const finding of docsCheckResult.findings) {
          const existing = docsFindingsByPath.get(finding.path) || []
          existing.push(finding)
          docsFindingsByPath.set(finding.path, existing)
        }

        // Group findings by path for clearer error messages
        for (const [path, findings] of docsFindingsByPath.entries()) {
          docsFailureReasons.push({
            type: 'DOCS_INCONSISTENT',
            message: `Documentation inconsistency in ${path}: ${findings.length} issue(s) found`,
          })
        }

        // Update drift attempt record with docs findings
        // Note: We already stored a drift attempt above for CI check, so we need to update it
        // For now, we'll insert a new record with combined failure reasons
        const allFailureReasons = [...failureReasons, ...docsFailureReasons]
        
        await supabase.from('drift_attempts').insert({
          ticket_pk: resolvedTicketPk,
          transition: transitionName,
          pr_url: prUrl,
          evaluated_head_sha: !('error' in ciStatus) && ciStatus.evaluatedSha ? ciStatus.evaluatedSha : null,
          overall_status: !('error' in ciStatus) ? ciStatus.overall : null,
          required_checks: !('error' in ciStatus) ? ciStatus.requiredChecks : null,
          failing_check_names: !('error' in ciStatus) && ciStatus.failingCheckNames ? ciStatus.failingCheckNames : null,
          checks_page_url: !('error' in ciStatus) ? ciStatus.checksPageUrl : null,
          evaluation_error: evaluationError,
          failure_reasons: allFailureReasons.length > 0 ? allFailureReasons : null,
          references: {
            pr_url: prUrl,
            ...(!('error' in ciStatus) && ciStatus.evaluatedSha ? { head_sha: ciStatus.evaluatedSha } : {}),
            docs_findings: docsCheckResult.findings,
          },
          blocked: true,
        })

        // Build error message listing inconsistent docs
        const inconsistentDocsList = Array.from(docsFindingsByPath.keys())
          .map((path) => `  - ${path}`)
          .join('\n')

        json(res, 200, {
          success: false,
          error: `Cannot move ticket: Documentation inconsistencies detected. All documentation must be consistent with code before moving to this column.`,
          errorCode: 'DOCS_INCONSISTENT',
          docsFindings: docsCheckResult.findings,
          inconsistentDocs: Array.from(docsFindingsByPath.keys()),
          remedy: `Fix documentation inconsistencies before moving to ${columnId}.\n\nInconsistent documents:\n${inconsistentDocsList}\n\nSee drift attempt details for specific findings.`,
        })
        return
      }
      
      // Note: Drift attempt was already stored above, even for successful transitions
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
    const driftGatedColumns = ['col-doing', 'col-qa', 'col-human-in-the-loop', 'col-process-review', 'col-done']
    if (!driftGatedColumns.includes(columnId || '')) {
      const transitionName = await formatTransition(currentColumnId, columnId)
      if (transitionName && resolvedTicketPk) {
        // Store attempt record for non-drift-gated transitions
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

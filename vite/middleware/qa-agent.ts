import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import type { Plugin } from 'vite'
import { readJsonBody, humanReadableCursorError } from '../helpers'
import { insertAgentArtifact } from '../artifact-helpers'

/** QA agent endpoint - launches Cursor Cloud Agent to QA tickets */
export function qaAgentPlugin(): Plugin {
  return {
    name: 'qa-agent-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/qa-agent/run' || req.method !== 'POST') {
          next()
          return
        }

        const writeStage = (stage: object) => {
          res.write(JSON.stringify(stage) + '\n')
        }

        try {
          const body = (await readJsonBody(req)) as {
            message?: string
            supabaseUrl?: string
            supabaseAnonKey?: string
          }
          const message = typeof body.message === 'string' ? body.message.trim() : ''
          const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
          const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

          const key = process.env.CURSOR_API_KEY || process.env.VITE_CURSOR_API_KEY
          if (!key || !key.trim()) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-ndjson')
            writeStage({ stage: 'failed', error: 'Cursor API is not configured. Set CURSOR_API_KEY in .env.', status: 'not-configured' })
            res.end()
            return
          }

          // Parse "QA ticket XXXX" pattern
          const ticketIdMatch = message.match(/qa\s+ticket\s+(\d{4})/i)
          const ticketId = ticketIdMatch ? ticketIdMatch[1] : null

          if (!ticketId) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-ndjson')
            writeStage({
              stage: 'failed',
              error: 'Say "QA ticket XXXX" (e.g. QA ticket 0046) to QA a ticket.',
              status: 'invalid-input',
            })
            res.end()
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/x-ndjson')
          res.flushHeaders?.()

          const auth = Buffer.from(`${key.trim()}:`).toString('base64')
          const repoRoot = path.resolve(__dirname, '../..')

          let bodyMd: string
          let ticketFilename: string
          let branchName: string | null = null

          writeStage({ stage: 'fetching_ticket' })

          // Fetch ticket: Supabase-only (0065)
          if (supabaseUrl && supabaseAnonKey) {
            const { createClient } = await import('@supabase/supabase-js')
            const supabase = createClient(supabaseUrl, supabaseAnonKey)
            const { data: row, error } = await supabase
              .from('tickets')
              .select('body_md, filename, kanban_column_id')
              .eq('id', ticketId)
              .single()
            if (error || !row?.body_md) {
              writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in Supabase. Supabase-only mode requires Supabase connection.`, status: 'ticket-not-found' })
              res.end()
              return
            }
            bodyMd = row.body_md
            ticketFilename = row.filename ?? `${ticketId}-unknown.md`
            
            // Move QA ticket from QA column to Doing when QA agent starts (0088)
            const currentColumnId = (row as any).kanban_column_id as string | null
            if (currentColumnId === 'col-qa') {
              try {
                const { data: inColumn } = await supabase
                  .from('tickets')
                  .select('kanban_position')
                  .eq('kanban_column_id', 'col-doing')
                  .order('kanban_position', { ascending: false })
                  .limit(1)
                const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
                const movedAt = new Date().toISOString()
                const { error: updateErr } = await supabase
                  .from('tickets')
                  .update({ kanban_column_id: 'col-doing', kanban_position: nextPosition, kanban_moved_at: movedAt })
                  .eq('id', ticketId)
                if (updateErr) {
                  console.error(`[QA Agent] Failed to move ticket ${ticketId} from QA to Doing:`, updateErr.message)
                  // Continue anyway - ticket will stay in QA
                }
              } catch (moveErr) {
                console.error(`[QA Agent] Error moving ticket ${ticketId} from QA to Doing:`, moveErr instanceof Error ? moveErr.message : String(moveErr))
                // Continue anyway
              }
            }
          } else {
            writeStage({ stage: 'failed', error: `Supabase not configured. Connect project to fetch ticket ${ticketId} from Supabase.`, status: 'ticket-not-found' })
            res.end()
            return
          }

          // Extract branch name from ticket (QA → Branch field)
          writeStage({ stage: 'fetching_branch' })
          const branchMatch = bodyMd.match(/-?\s*\*\*Branch\*\*:\s*`?([^`\n]+)`?/i)
          if (branchMatch) {
            branchName = branchMatch[1].trim()
          } else {
            // Fallback: construct branch name from ticket ID and title
            const titleMatch = bodyMd.match(/-?\s*\*\*Title\*\*:\s*(.+?)(?:\n|$)/i)
            const title = titleMatch ? titleMatch[1].trim() : 'unknown'
            const slug = title
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '') || 'ticket'
            branchName = `ticket/${ticketId}-${slug}`
          }

          if (!branchName) {
            writeStage({ stage: 'failed', error: `Could not determine branch name for ticket ${ticketId}. Ensure the ticket has a "Branch" field in the QA section.`, status: 'branch-not-found' })
            res.end()
            return
          }

          // Use main when ticket indicates merged to main for QA access (or when cloud cannot access feature branch)
          const mergedToMainForQA = /merged to\s*`?main`?\s*for\s*QA\s*access/i.test(bodyMd)
          const refForApi: string = mergedToMainForQA ? 'main' : branchName

          // Build QA prompt from ticket and rules
          const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
          const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
          const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
          const goal = (goalMatch?.[1] ?? '').trim()
          const deliverable = (deliverableMatch?.[1] ?? '').trim()
          const criteria = (criteriaMatch?.[1] ?? '').trim()

          // Read QA ruleset
          const qaRulesPath = path.join(repoRoot, '.cursor', 'rules', 'qa-audit-report.mdc')
          let qaRules = ''
          try {
            qaRules = fs.readFileSync(qaRulesPath, 'utf8')
          } catch {
            qaRules = '# QA Audit Report\n\nWhen you QA a ticket, you must add a QA report to the ticket\'s audit folder.'
          }

          const verifyFromMainNote =
            refForApi === 'main'
              ? '\n**Verify from:** `main` (implementation was merged to main for QA access). Do NOT attempt to check out or use the feature branch; use the latest `main` only.\n'
              : ''

          const promptText = [
            `QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.${verifyFromMainNote}`,
            '',
            '## Ticket',
            `**ID**: ${ticketId}`,
            `**Branch (for context; use ref above)**: ${branchName}`,
            refForApi === 'main' ? '**Verify from:** `main`' : '',
            '',
            '## Goal',
            goal || '(not specified)',
            '',
            '## Human-verifiable deliverable',
            deliverable || '(not specified)',
            '',
            '## Acceptance criteria',
            criteria || '(not specified)',
            '',
            '## QA Rules',
            qaRules,
            '',
            '## Instructions',
            refForApi === 'main'
              ? '1. Review the implementation on `main` (already merged for QA access). Do NOT check out the feature branch.'
              : '1. Review the implementation on the feature branch.',
            '2. Check that all required audit artifacts exist (plan, worklog, changed-files, decisions, verification, pm-review).',
            '3. Perform code review and verify acceptance criteria.',
            '4. Generate `docs/audit/${ticketId}-<short-title>/qa-report.md` with:',
            '   - Ticket & deliverable summary',
            '   - Audit artifacts check',
            '   - Code review (PASS/FAIL with evidence)',
            '   - UI verification notes',
            '   - Verdict (PASS/FAIL)',
            '5. If PASS:',
            refForApi === 'main'
              ? '   - Commit and push the qa-report to main; move the ticket to Human in the Loop. Do NOT merge again or delete any branch.'
              : '   - Commit and push the qa-report to the feature branch, merge the feature branch into main, move the ticket to Human in the Loop (col-human-in-the-loop), delete the feature branch (local and remote).',
            '6. If FAIL:',
            '   - Commit and push the qa-report only',
            '   - Do NOT merge',
            '   - Report what failed and recommend a bugfix ticket',
          ].join('\n')

          writeStage({ stage: 'launching' })

          // Resolve GitHub repo URL from git remote
          const { execSync } = await import('child_process')
          let repoUrl: string
          try {
            const out = execSync('git remote get-url origin', { cwd: repoRoot, encoding: 'utf8' })
            const raw = out.trim()
            const sshMatch = raw.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i)
            if (sshMatch) {
              repoUrl = `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
            } else if (/^https:\/\/github\.com\//i.test(raw)) {
              repoUrl = raw.replace(/\.git$/i, '')
            } else {
              writeStage({ stage: 'failed', error: 'No GitHub remote found. The connected project must have a GitHub origin.', status: 'no-github-remote' })
              res.end()
              return
            }
          } catch {
            writeStage({ stage: 'failed', error: 'Could not resolve GitHub repository. Ensure the project has a git remote named "origin" pointing to a GitHub repo.', status: 'no-github-remote' })
            res.end()
            return
          }

          // POST /v0/agents to launch cloud agent with QA ruleset
          let launchRes = await fetch('https://api.cursor.com/v0/agents', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: { text: promptText },
              source: { repository: repoUrl, ref: refForApi },
              target: { branchName: 'main' },
            }),
          })

          let launchText = await launchRes.text()
          // If feature branch does not exist (e.g. already merged and deleted), retry with main
          if (!launchRes.ok && launchRes.status === 400 && refForApi !== 'main') {
            const branchNotFound =
              /branch\s+.*\s+does not exist/i.test(launchText) || /does not exist.*branch/i.test(launchText)
            if (branchNotFound) {
              const promptTextOnMain = [
                `QA this ticket implementation. The feature branch is no longer available; verify from the latest \`main\` branch. Review the code, generate a QA report, and complete the QA workflow.`,
                '',
                '## Ticket',
                `**ID**: ${ticketId}`,
                `**Branch (was; now merged)**: ${branchName}`,
                '**Verify from:** `main`',
                '',
                '## Goal',
                goal || '(not specified)',
                '',
                '## Human-verifiable deliverable',
                deliverable || '(not specified)',
                '',
                '## Acceptance criteria',
                criteria || '(not specified)',
                '',
                '## QA Rules',
                qaRules,
                '',
                '## Instructions',
                '1. You are on `main` (feature branch was merged). Review the implementation on main.',
                '2. Check that all required audit artifacts exist (plan, worklog, changed-files, decisions, verification, pm-review).',
                '3. Perform code review and verify acceptance criteria.',
                '4. Generate `docs/audit/${ticketId}-<short-title>/qa-report.md`; note in the report that verification was performed against main.',
                '5. If PASS: commit and push the qa-report to main, move the ticket to Human in the Loop. Do NOT merge again or delete any branch.',
                '6. If FAIL: commit and push the qa-report only; do NOT merge; report what failed and recommend a bugfix ticket.',
              ].join('\n')
              launchRes = await fetch('https://api.cursor.com/v0/agents', {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${auth}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  prompt: { text: promptTextOnMain },
                  source: { repository: repoUrl, ref: 'main' },
                  target: { branchName: 'main' },
                }),
              })
              launchText = await launchRes.text()
            }
          }

          if (!launchRes.ok) {
            let errDetail: string
            try {
              const p = JSON.parse(launchText) as { message?: string; error?: string }
              errDetail = p.message ?? p.error ?? launchText
            } catch {
              errDetail = launchText
            }
            writeStage({ stage: 'failed', error: humanReadableCursorError(launchRes.status, errDetail), status: 'launch-failed' })
            res.end()
            return
          }

          let launchData: { id?: string; status?: string }
          try {
            launchData = JSON.parse(launchText) as typeof launchData
          } catch {
            writeStage({ stage: 'failed', error: 'Invalid response from Cursor API when launching agent.', status: 'launch-failed' })
            res.end()
            return
          }

          const agentId = launchData.id
          if (!agentId) {
            writeStage({ stage: 'failed', error: 'Cursor API did not return an agent ID.', status: 'launch-failed' })
            res.end()
            return
          }

          // Poll agent status until FINISHED (or failed)
          const pollInterval = 4000
          let lastStatus = launchData.status ?? 'CREATING'
          writeStage({ stage: 'polling', cursorStatus: lastStatus })

          for (;;) {
            await new Promise((r) => setTimeout(r, pollInterval))
            const statusRes = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
              method: 'GET',
              headers: { Authorization: `Basic ${auth}` },
            })
            const statusText = await statusRes.text()
            if (!statusRes.ok) {
              writeStage({ stage: 'failed', error: humanReadableCursorError(statusRes.status, statusText), status: 'poll-failed' })
              res.end()
              return
            }
            let statusData: { status?: string; summary?: string }
            try {
              statusData = JSON.parse(statusText) as typeof statusData
            } catch {
              writeStage({ stage: 'failed', error: 'Invalid response when polling agent status.', status: 'poll-failed' })
              res.end()
              return
            }
            lastStatus = statusData.status ?? lastStatus
            writeStage({ stage: 'polling', cursorStatus: lastStatus })

            if (lastStatus === 'FINISHED') {
              const summary = statusData.summary ?? 'QA completed.'
              writeStage({ stage: 'generating_report', content: summary })

              // Check if qa-report.md was created (the agent should have done this)
              const auditDirMatch = ticketFilename.match(/^(\d{4})-(.+)\.md$/)
              const shortTitle = auditDirMatch ? auditDirMatch[2] : 'unknown'
              const auditDir = path.join(repoRoot, 'docs', 'audit', `${ticketId}-${shortTitle}`)
              const qaReportPath = path.join(auditDir, 'qa-report.md')

              // Try to read the qa-report to determine verdict
              let verdict: 'PASS' | 'FAIL' | 'UNKNOWN' = 'UNKNOWN'
              let qaReportContent = ''
              try {
                if (fs.existsSync(qaReportPath)) {
                  qaReportContent = fs.readFileSync(qaReportPath, 'utf8')
                  if (/verdict.*pass/i.test(qaReportContent) || /ok\s+to\s+merge/i.test(qaReportContent)) {
                    verdict = 'PASS'
                  } else if (/verdict.*fail/i.test(qaReportContent)) {
                    verdict = 'FAIL'
                  }
                }
              } catch {
                // Report may not exist yet or be unreadable
              }

              // Insert QA artifact (0082) - create completion report directly in Supabase
              if (supabaseUrl && supabaseAnonKey) {
                try {
                  const { createClient } = await import('@supabase/supabase-js')
                  const supabase = createClient(supabaseUrl, supabaseAnonKey)
                  
                  // Get ticket to retrieve pk and repo_full_name
                  const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('pk, repo_full_name, display_id')
                    .eq('id', ticketId)
                    .single()
                  
                  if (ticketData?.pk && ticketData?.repo_full_name) {
                    // Build QA completion report from agent summary and verdict
                    const displayId = ticketData.display_id || ticketId
                    let artifactBody = summary
                    
                    if (verdict === 'PASS') {
                      artifactBody += `\n\n**Verdict: PASS**\n\nTicket ${displayId} has been merged to main and moved to Human in the Loop.`
                    } else if (verdict === 'FAIL') {
                      artifactBody += `\n\n**Verdict: FAIL**\n\nThe ticket was not merged. Review the implementation and create a bugfix ticket if needed.`
                    } else {
                      artifactBody += `\n\n**Verdict: UNKNOWN**\n\nQA completed for ticket ${displayId}. Verdict could not be determined.`
                    }
                    
                    await insertAgentArtifact(
                      supabaseUrl,
                      supabaseAnonKey,
                      ticketData.pk,
                      ticketData.repo_full_name,
                      'qa',
                      `QA report for ticket ${displayId}`,
                      artifactBody
                    )
                  } else {
                    console.error(`[QA Agent] Could not retrieve ticket data for ${ticketId}`)
                  }
                } catch (artifactErr) {
                  console.error('[QA Agent] Failed to insert artifact:', artifactErr)
                }
              } else {
                console.warn('[QA Agent] Supabase credentials not available, skipping artifact insertion')
              }

              // Move ticket to Human in the Loop if PASS, or if verdict is UNKNOWN (QA completed but verdict unclear)
              if (verdict === 'PASS' || verdict === 'UNKNOWN') {
                if (verdict === 'PASS') {
                  writeStage({ stage: 'merging', content: 'QA passed. Merging to main...' })
                } else {
                  writeStage({ stage: 'completed', content: 'QA completed. Moving to Human in the Loop...' })
                }
                
                // Move ticket to Human in the Loop
                if (supabaseUrl && supabaseAnonKey) {
                  writeStage({ stage: 'moving_ticket', content: 'Moving ticket to Human in the Loop...' })
                  try {
                    const { createClient } = await import('@supabase/supabase-js')
                    const supabase = createClient(supabaseUrl, supabaseAnonKey)
                    const { data: inColumn } = await supabase
                      .from('tickets')
                      .select('kanban_position')
                      .eq('kanban_column_id', 'col-human-in-the-loop')
                      .order('kanban_position', { ascending: false })
                      .limit(1)
                    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
                    const movedAt = new Date().toISOString()

                    await supabase
                      .from('tickets')
                      .update({
                        kanban_column_id: 'col-human-in-the-loop',
                        kanban_position: nextPosition,
                        kanban_moved_at: movedAt,
                      })
                      .eq('id', ticketId)

                    const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
                    spawn('node', [syncScriptPath], {
                      cwd: repoRoot,
                      env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
                      stdio: ['ignore', 'ignore', 'ignore'],
                    }).on('error', () => {})
                  } catch (moveErr) {
                    console.error('[QA Agent] Move to Human in the Loop failed:', moveErr)
                  }
                }

                if (verdict === 'PASS') {
                  const contentParts = [
                    `**QA PASSED** for ticket ${ticketId}`,
                    '',
                    summary,
                    '',
                    `Ticket ${ticketId} has been merged to main and moved to Human in the Loop.`,
                  ]
                  writeStage({ stage: 'completed', success: true, content: contentParts.join('\n'), verdict: 'PASS', status: 'completed' })
                } else {
                  const contentParts = [
                    `**QA COMPLETED** for ticket ${ticketId}`,
                    '',
                    summary,
                    '',
                    `Ticket ${ticketId} has been moved to Human in the Loop. Verdict could not be determined from qa-report.md.`,
                  ]
                  writeStage({ stage: 'completed', success: true, content: contentParts.join('\n'), verdict: 'UNKNOWN', status: 'completed' })
                }
                res.end()
                return
              } else if (verdict === 'FAIL') {
                // Move ticket back to To Do on FAIL
                if (supabaseUrl && supabaseAnonKey) {
                  writeStage({ stage: 'moving_ticket', content: 'Moving ticket back to To Do...' })
                  try {
                    const { createClient } = await import('@supabase/supabase-js')
                    const supabase = createClient(supabaseUrl, supabaseAnonKey)
                    const { data: inColumn } = await supabase
                      .from('tickets')
                      .select('kanban_position')
                      .eq('kanban_column_id', 'col-todo')
                      .order('kanban_position', { ascending: false })
                      .limit(1)
                    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
                    const movedAt = new Date().toISOString()

                    await supabase
                      .from('tickets')
                      .update({
                        kanban_column_id: 'col-todo',
                        kanban_position: nextPosition,
                        kanban_moved_at: movedAt,
                      })
                      .eq('id', ticketId)

                    const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
                    spawn('node', [syncScriptPath], {
                      cwd: repoRoot,
                      env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
                      stdio: ['ignore', 'ignore', 'ignore'],
                    }).on('error', () => {})
                  } catch (moveErr) {
                    console.error('[QA Agent] Move to To Do failed:', moveErr)
                  }
                }

                const contentParts = [
                  `**QA FAILED** for ticket ${ticketId}`,
                  '',
                  summary,
                  '',
                  'The ticket was not merged. Review the qa-report.md for details and create a bugfix ticket if needed.',
                  `Ticket ${ticketId} has been moved back to To Do.`,
                ]
                writeStage({ stage: 'completed', success: false, content: contentParts.join('\n'), verdict: 'FAIL', status: 'completed' })
                res.end()
                return
              }
            }

            if (lastStatus === 'FAILED' || lastStatus === 'CANCELLED' || lastStatus === 'ERROR') {
              const errMsg = statusData.summary ?? `Agent ended with status ${lastStatus}.`
              writeStage({ stage: 'failed', error: errMsg, status: lastStatus.toLowerCase() })
              res.end()
              return
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/x-ndjson')
          writeStage({ stage: 'failed', error: errMsg.replace(/\n/g, ' ').slice(0, 500), status: 'error' })
          res.end()
        }
      })
    },
  }
}

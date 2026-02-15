import path from 'path'
import type { Plugin } from 'vite'
import { readJsonBody, humanReadableCursorError } from '../helpers'
import { resolveRepoUrl } from './agent-helpers'
import { moveTicketToColumn } from './ticket-movement'
import { pollAgentStatus } from './agent-polling'
import { determineVerdict, handleQACompletion } from './qa-completion'
import { extractBranchName, buildQAPrompt } from './qa-helpers'
import { launchQAAgent } from './qa-launch'

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
          branchName = extractBranchName(bodyMd, ticketId)
          if (!branchName) {
            writeStage({ stage: 'failed', error: `Could not determine branch name for ticket ${ticketId}. Ensure the ticket has a "Branch" field in the QA section.`, status: 'branch-not-found' })
            res.end()
            return
          }

          // Use main when ticket indicates merged to main for QA access
          const mergedToMainForQA = /merged to\s*`?main`?\s*for\s*QA\s*access/i.test(bodyMd)
          const refForApi: string = mergedToMainForQA ? 'main' : branchName

          // Build QA prompt from ticket and rules
          const promptText = buildQAPrompt(bodyMd, ticketId, branchName, refForApi, repoRoot)

          writeStage({ stage: 'launching' })

          // Resolve GitHub repo URL from git remote
          let repoUrl: string
          try {
            repoUrl = resolveRepoUrl(repoRoot)
          } catch (err) {
            writeStage({ stage: 'failed', error: err instanceof Error ? err.message : 'Could not resolve GitHub repository', status: 'no-github-remote' })
            res.end()
            return
          }

          // Launch QA agent with retry logic
          let agentId: string
          try {
            const result = await launchQAAgent(auth, repoUrl, refForApi, promptText, branchName, bodyMd, ticketId, repoRoot)
            agentId = result.agentId
          } catch (err) {
            writeStage({ stage: 'failed', error: err instanceof Error ? err.message : String(err), status: 'launch-failed' })
            res.end()
            return
          }

          // Poll agent status until FINISHED (or failed)
          await pollAgentStatus(agentId, auth, writeStage, async (summary) => {
            writeStage({ stage: 'generating_report', content: summary })

            // Check if qa-report.md was created (the agent should have done this)
            const auditDirMatch = ticketFilename.match(/^(\d{4})-(.+)\.md$/)
            const shortTitle = auditDirMatch ? auditDirMatch[2] : 'unknown'
            const auditDir = path.join(repoRoot, 'docs', 'audit', `${ticketId}-${shortTitle}`)
            const qaReportPath = path.join(auditDir, 'qa-report.md')

            // Determine verdict from qa-report
            const verdict = determineVerdict(qaReportPath)

            // Handle completion (move ticket, insert artifact)
            if (supabaseUrl && supabaseAnonKey) {
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const supabase = createClient(supabaseUrl, supabaseAnonKey)
                await handleQACompletion(supabase, ticketId, bodyMd, summary, verdict, ticketFilename, repoRoot, supabaseUrl, supabaseAnonKey)
              } catch (err) {
                console.error('[QA Agent] Completion handling failed:', err)
              }
            }

            // Write final stage message
            if (verdict === 'PASS') {
              writeStage({ stage: 'merging', content: 'QA passed. Merging to main...' })
              const contentParts = [
                `**QA PASSED** for ticket ${ticketId}`,
                '',
                summary,
                '',
                `Ticket ${ticketId} has been merged to main and moved to Human in the Loop.`,
              ]
              writeStage({ stage: 'completed', success: true, content: contentParts.join('\n'), verdict: 'PASS', status: 'completed' })
            } else if (verdict === 'UNKNOWN') {
              writeStage({ stage: 'completed', content: 'QA completed. Moving to Human in the Loop...' })
              const contentParts = [
                `**QA COMPLETED** for ticket ${ticketId}`,
                '',
                summary,
                '',
                `Ticket ${ticketId} has been moved to Human in the Loop. Verdict could not be determined from qa-report.md.`,
              ]
              writeStage({ stage: 'completed', success: true, content: contentParts.join('\n'), verdict: 'UNKNOWN', status: 'completed' })
            } else {
              writeStage({ stage: 'moving_ticket', content: 'Moving ticket back to To Do...' })
              const contentParts = [
                `**QA FAILED** for ticket ${ticketId}`,
                '',
                summary,
                '',
                'The ticket was not merged. Review the qa-report.md for details and create a bugfix ticket if needed.',
                `Ticket ${ticketId} has been moved back to To Do.`,
              ]
              writeStage({ stage: 'completed', success: false, content: contentParts.join('\n'), verdict: 'FAIL', status: 'completed' })
            }
            res.end()
          })
          if (!res.writableEnded) {
            res.end()
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

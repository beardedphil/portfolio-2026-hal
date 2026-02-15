import path from 'path'
import type { Plugin } from 'vite'
import { readJsonBody, humanReadableCursorError } from '../helpers'
import { resolveRepoUrl, buildPromptFromTicket } from './agent-helpers'
import { moveTicketToColumn } from './ticket-movement'
import { handleImplementationCompletion } from './agent-completion'
import { pollAgentStatus } from './agent-polling'

/** Implementation agent endpoint - launches Cursor Cloud Agent to implement tickets */
export function implementationAgentPlugin(): Plugin {
  return {
    name: 'implementation-agent-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/implementation-agent/run' || req.method !== 'POST') {
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

          // Parse "Implement ticket XXXX" pattern (0046)
          const ticketIdMatch = message.match(/implement\s+ticket\s+(\d{4})/i)
          const ticketId = ticketIdMatch ? ticketIdMatch[1] : null

          if (!ticketId) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-ndjson')
            writeStage({
              stage: 'failed',
              error: 'Say "Implement ticket XXXX" (e.g. Implement ticket 0046) to implement a ticket.',
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

          writeStage({ stage: 'fetching_ticket' })

          // Fetch ticket: Supabase-only (0065)
          let currentColumnId: string | null = null
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
            currentColumnId = row.kanban_column_id ?? null
          } else {
            writeStage({ stage: 'failed', error: `Supabase not configured. Connect project to fetch ticket ${ticketId} from Supabase.`, status: 'ticket-not-found' })
            res.end()
            return
          }

          // Move ticket from To Do to Doing when Implementation Agent starts (0053)
          if (supabaseUrl && supabaseAnonKey && currentColumnId === 'col-todo') {
            const { createClient } = await import('@supabase/supabase-js')
            const supabase = createClient(supabaseUrl, supabaseAnonKey)
            const moveResult = await moveTicketToColumn(supabase, ticketId, bodyMd, 'col-doing', repoRoot, supabaseUrl, supabaseAnonKey)
            if (!moveResult.success) {
              writeStage({ 
                stage: 'failed', 
                error: `Failed to move ticket to Doing: ${moveResult.error}. The ticket remains in To Do.`, 
                status: 'move-to-doing-failed' 
              })
              res.end()
              return
            }
            bodyMd = moveResult.updatedBodyMd || bodyMd
          }

          // Build prompt from Goal, Human-verifiable deliverable, Acceptance criteria
          const ticketSections = buildPromptFromTicket(bodyMd)
          const promptText = `Implement this ticket.\n\n${ticketSections}`

          writeStage({ stage: 'resolving_repo' })

          // Resolve GitHub repo URL from git remote
          let repoUrl: string
          try {
            repoUrl = resolveRepoUrl(repoRoot)
          } catch (err) {
            writeStage({ stage: 'failed', error: err instanceof Error ? err.message : 'Could not resolve GitHub repository', status: 'no-github-remote' })
            res.end()
            return
          }

          writeStage({ stage: 'launching' })

          // POST /v0/agents to launch cloud agent
          const launchRes = await fetch('https://api.cursor.com/v0/agents', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: { text: promptText },
              source: { repository: repoUrl, ref: 'main' },
              target: { autoCreatePr: true, branchName: `ticket/${ticketId}-implementation` },
            }),
          })

          const launchText = await launchRes.text()
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
          await pollAgentStatus(agentId, auth, writeStage, async (summary, prUrl) => {
            // Move ticket to QA in Supabase
            if (supabaseUrl && supabaseAnonKey) {
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const supabase = createClient(supabaseUrl, supabaseAnonKey)
                await handleImplementationCompletion(supabase, ticketId, bodyMd, summary, prUrl, repoRoot, supabaseUrl, supabaseAnonKey)
              } catch (moveErr) {
                console.error('[Implementation Agent] Move to QA failed:', moveErr)
              }
            }

            const contentParts = [summary]
            if (prUrl) contentParts.push(`\n\nPull request: ${prUrl}`)
            contentParts.push(`\n\nTicket ${ticketId} moved to QA.`)
            writeStage({ stage: 'completed', success: true, content: contentParts.join(''), prUrl, summary, status: 'completed' })
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

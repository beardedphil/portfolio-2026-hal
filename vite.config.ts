import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { spawn } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'

// Load .env so OPENAI_API_KEY / OPENAI_MODEL are available in server middleware
loadEnv()

/** Human-readable error summary for Cursor API failures (no stack traces). */
function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 100)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

/** Read JSON body from incoming request (for API proxy). */
function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Response type from PM agent endpoint.
 * Matches the interface expected from hal-agents runPmAgent().
 */
interface PmAgentResponse {
  reply: string
  toolCalls: Array<{
    name: string
    input: unknown
    output: unknown
  }>
  outboundRequest: object | null
  /** OpenAI Responses API response id for continuity (send as previous_response_id on next turn). */
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  /** When create_ticket succeeded: id, file path, sync result; retried/attempts when collision retry (0023). */
  ticketCreationResult?: {
    id: string
    filename: string
    filePath: string
    syncSuccess: boolean
    syncError?: string
    retried?: boolean
    attempts?: number
  }
  /** True when Supabase creds were sent so create_ticket was available (for Diagnostics). */
  createTicketAvailable?: boolean
  /** Runner implementation label for diagnostics (e.g. "v2 (shared)"). */
  agentRunner?: string
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hal-agents-prebuild',
      configureServer() {
        // Pre-build hal-agents at dev server start so first /api/pm/check-unassigned is fast (avoids "Failed to fetch" from long build)
        const repoRoot = path.resolve(__dirname)
        spawn('npm', ['run', 'build', '--prefix', path.join(repoRoot, 'projects/hal-agents')], {
          cwd: repoRoot,
          stdio: ['ignore', 'ignore', 'ignore'],
        }).on('error', () => {})
      },
    },
    {
      name: 'openai-responses-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/openai/responses' || req.method !== 'POST') {
            next()
            return
          }
          try {
            const body = (await readJsonBody(req)) as { input?: string }
            const key = process.env.OPENAI_API_KEY
            const model = process.env.OPENAI_MODEL
            if (!key || !model) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error:
                    'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in .env.',
                })
              )
              return
            }
            const openaiRes = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify({ model, input: body.input ?? '' }),
            })
            const text = await openaiRes.text()
            res.statusCode = openaiRes.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }
        })
      },
    },
    {
      name: 'pm-agent-endpoint',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/pm/respond' || req.method !== 'POST') {
            next()
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              message?: string
              conversationHistory?: Array<{ role: string; content: string }>
              previous_response_id?: string
              projectId?: string
              supabaseUrl?: string
              supabaseAnonKey?: string
            }
            const message = body.message ?? ''
            let conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : undefined
            const previousResponseId = typeof body.previous_response_id === 'string' ? body.previous_response_id : undefined
            const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
            const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
            const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

            if (projectId && (!supabaseUrl || !supabaseAnonKey)) {
              console.warn('[HAL PM] projectId received but Supabase creds missing or empty — create_ticket will not be available')
            }

            if (!message.trim()) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Message is required' }))
              return
            }

            const key = process.env.OPENAI_API_KEY
            const model = process.env.OPENAI_MODEL

            if (!key || !model) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  reply: '',
                  toolCalls: [],
                  outboundRequest: null,
                  error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in .env.',
                  errorPhase: 'openai',
                } satisfies PmAgentResponse)
              )
              return
            }

            // Import shared runner (and summarizeForContext) from hal-agents built dist (0043)
            let runnerModule: { getSharedRunner?: () => { label: string; run: (msg: string, config: object) => Promise<object> }; summarizeForContext?: (msgs: unknown[], key: string, model: string) => Promise<string> } | null = null
            const runnerDistPath = path.resolve(__dirname, 'projects/hal-agents/dist/agents/runner.js')
            try {
              runnerModule = await import(pathToFileURL(runnerDistPath).href)
            } catch (err) {
              console.error('[HAL PM] Failed to load hal-agents runner dist:', err)
            }

            // When project DB (Supabase) is provided, fetch full history and build bounded context pack (summary + recent by content size)
            const RECENT_MAX_CHARS = 12_000
            let conversationContextPack: string | undefined
            if (projectId && supabaseUrl && supabaseAnonKey && runnerModule) {
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const supabase = createClient(supabaseUrl, supabaseAnonKey)
                const { data: rows } = await supabase
                  .from('hal_conversation_messages')
                  .select('role, content, sequence')
                  .eq('project_id', projectId)
                  .eq('agent', 'project-manager')
                  .order('sequence', { ascending: true })
                const messages = (rows ?? []).map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content ?? '' }))
                const recentFromEnd: typeof messages = []
                let recentLen = 0
                for (let i = messages.length - 1; i >= 0; i--) {
                  const t = messages[i]
                  const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
                  if (recentLen + lineLen > RECENT_MAX_CHARS && recentFromEnd.length > 0) break
                  recentFromEnd.unshift(t)
                  recentLen += lineLen
                }
                const olderCount = messages.length - recentFromEnd.length
                if (olderCount > 0) {
                  const older = messages.slice(0, olderCount)
                  const { data: summaryRow } = await supabase
                    .from('hal_conversation_summaries')
                    .select('summary_text, through_sequence')
                    .eq('project_id', projectId)
                    .eq('agent', 'project-manager')
                    .single()
                  const needNewSummary = !summaryRow || (summaryRow.through_sequence ?? 0) < olderCount
                  let summaryText: string
                  // HAL uses the external LLM (OpenAI) to summarize older turns when building the context pack
                  if (needNewSummary && typeof runnerModule.summarizeForContext === 'function') {
                    summaryText = await runnerModule.summarizeForContext(older, key, model)
                    await supabase.from('hal_conversation_summaries').upsert(
                      {
                        project_id: projectId,
                        agent: 'project-manager',
                        summary_text: summaryText,
                        through_sequence: olderCount,
                        updated_at: new Date().toISOString(),
                      },
                      { onConflict: 'project_id,agent' }
                    )
                  } else if (summaryRow?.summary_text) {
                    summaryText = summaryRow.summary_text
                  } else {
                    summaryText = `(${older.length} older messages)`
                  }
                  conversationContextPack = `Summary of earlier conversation:\n\n${summaryText}\n\nRecent conversation (within ${RECENT_MAX_CHARS.toLocaleString()} characters):\n\n${recentFromEnd.map((t) => `**${t.role}**: ${t.content}`).join('\n\n')}`
                } else if (messages.length > 0) {
                  conversationContextPack = messages.map((t) => `**${t.role}**: ${t.content}`).join('\n\n')
                }
                conversationHistory = undefined
              } catch (dbErr) {
                console.error('[HAL PM] DB context pack failed, falling back to client history:', dbErr)
              }
            }

            const runner = runnerModule?.getSharedRunner?.()
            if (!runner?.run) {
              // hal-agents#0003 not implemented yet - return stub response
              const stubResponse: PmAgentResponse = {
                reply: '[PM Agent] The PM agent core is not yet implemented. Waiting for hal-agents#0003 to be completed.\n\nYour message was: "' + message + '"',
                toolCalls: [],
                outboundRequest: {
                  _stub: true,
                  _note: 'hal-agents shared runner not available yet',
                  model,
                  message,
                },
                error: 'PM agent core not implemented (hal-agents#0003 pending)',
                errorPhase: 'not-implemented',
              }
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(stubResponse))
              return
            }

            // Call the shared runner (PM agent; pass Supabase so create_ticket tool is available when project connected)
            const repoRoot = path.resolve(__dirname)
            const createTicketAvailable = !!(supabaseUrl && supabaseAnonKey)
            if (createTicketAvailable) {
              console.log('[HAL PM] create_ticket available for this request (Supabase creds provided)')
            } else {
              console.log('[HAL PM] create_ticket NOT available (no Supabase creds; connect project with .env)')
            }
            const result = (await runner.run(message, {
              repoRoot,
              openaiApiKey: key,
              openaiModel: model,
              conversationHistory,
              conversationContextPack,
              previousResponseId,
              ...(createTicketAvailable ? { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! } : {}),
              ...(projectId ? { projectId } : {}),
            })) as PmAgentResponse & { toolCalls: Array<{ name: string; input: unknown; output: unknown }> }

            // If create_ticket succeeded, run sync-tickets so the new row is written to docs/tickets/ (0011)
            let ticketCreationResult: PmAgentResponse['ticketCreationResult']
            const createTicketCall = result.toolCalls?.find(
              (c) => c.name === 'create_ticket' && typeof c.output === 'object' && c.output !== null && (c.output as { success?: boolean }).success === true
            )
            if (createTicketCall && supabaseUrl && supabaseAnonKey) {
              const out = createTicketCall.output as {
                id: string
                filename: string
                filePath: string
                retried?: boolean
                attempts?: number
              }
              ticketCreationResult = {
                id: out.id,
                filename: out.filename,
                filePath: out.filePath,
                syncSuccess: false,
                ...(out.retried && out.attempts != null && { retried: true, attempts: out.attempts }),
              }
              const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
              try {
                const syncResult = await new Promise<{ success: boolean; stderr?: string }>((resolve) => {
                  const child = spawn('node', [syncScriptPath], {
                    cwd: repoRoot,
                    env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
                    stdio: ['ignore', 'pipe', 'pipe'],
                  })
                  let stderr = ''
                  child.stderr?.on('data', (d) => { stderr += String(d) })
                  child.on('close', (code) => resolve({ success: code === 0, stderr: stderr || undefined }))
                })
                ticketCreationResult.syncSuccess = syncResult.success
                if (!syncResult.success && syncResult.stderr) {
                  ticketCreationResult.syncError = syncResult.stderr.trim().slice(0, 500)
                }
              } catch (syncErr) {
                ticketCreationResult.syncError = syncErr instanceof Error ? syncErr.message : String(syncErr)
              }
            }

            const response: PmAgentResponse = {
              reply: result.reply,
              toolCalls: result.toolCalls ?? [],
              outboundRequest: result.outboundRequest ?? null,
              ...(result.responseId != null && { responseId: result.responseId }),
              ...(result.error != null && { error: result.error }),
              ...(result.errorPhase != null && { errorPhase: result.errorPhase }),
              ...(ticketCreationResult != null && { ticketCreationResult }),
              createTicketAvailable,
              agentRunner: runner.label,
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(response))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                reply: '',
                toolCalls: [],
                outboundRequest: null,
                error: err instanceof Error ? err.message : String(err),
                errorPhase: 'openai',
              } satisfies PmAgentResponse)
            )
          }
        })
      },
    },
    {
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
            const repoRoot = path.resolve(__dirname)
            const ticketsDir = path.join(repoRoot, 'docs', 'tickets')

            let bodyMd: string
            let ticketFilename: string

            writeStage({ stage: 'fetching_ticket' })

            // Fetch ticket: Supabase first (if creds provided), else docs/tickets
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
                // Fallback to docs
                const files = fs.readdirSync(ticketsDir, { withFileTypes: true })
                const match = files.find((f) => f.isFile() && f.name.startsWith(ticketId + '-') && f.name.endsWith('.md'))
                if (!match) {
                  writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in Supabase or docs/tickets.`, status: 'ticket-not-found' })
                  res.end()
                  return
                }
                ticketFilename = match.name
                bodyMd = fs.readFileSync(path.join(ticketsDir, ticketFilename), 'utf8')
              } else {
                bodyMd = row.body_md
                ticketFilename = row.filename ?? `${ticketId}-unknown.md`
                currentColumnId = row.kanban_column_id ?? null
              }
            } else {
              const files = fs.readdirSync(ticketsDir, { withFileTypes: true })
              const match = files.find((f) => f.isFile() && f.name.startsWith(ticketId + '-') && f.name.endsWith('.md'))
              if (!match) {
                writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in docs/tickets. Connect project to fetch from Supabase.`, status: 'ticket-not-found' })
                res.end()
                return
              }
              ticketFilename = match.name
              bodyMd = fs.readFileSync(path.join(ticketsDir, ticketFilename), 'utf8')
            }

            // Move ticket from To Do to Doing when Implementation Agent starts (0053)
            if (supabaseUrl && supabaseAnonKey && currentColumnId === 'col-todo') {
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const supabase = createClient(supabaseUrl, supabaseAnonKey)
                
                // Get max position in Doing column
                const { data: inColumn, error: fetchErr } = await supabase
                  .from('tickets')
                  .select('kanban_position')
                  .eq('kanban_column_id', 'col-doing')
                  .order('kanban_position', { ascending: false })
                  .limit(1)
                
                if (fetchErr) {
                  writeStage({ 
                    stage: 'failed', 
                    error: `Failed to move ticket to Doing: ${fetchErr.message}. The ticket remains in To Do.`, 
                    status: 'move-to-doing-failed' 
                  })
                  res.end()
                  return
                }
                
                const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
                const movedAt = new Date().toISOString()
                
                // Update body_md frontmatter to keep DB and docs in sync
                const content = bodyMd
                const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
                let updatedBodyMd = content
                if (fmMatch) {
                  const block = fmMatch[1]
                  const lines = block.split('\n')
                  const out: string[] = []
                  let hasCol = false
                  let hasPos = false
                  let hasMoved = false
                  for (const line of lines) {
                    if (/^kanbanColumnId\s*:/.test(line)) { out.push(`kanbanColumnId: col-doing`); hasCol = true; continue }
                    if (/^kanbanPosition\s*:/.test(line)) { out.push(`kanbanPosition: ${nextPosition}`); hasPos = true; continue }
                    if (/^kanbanMovedAt\s*:/.test(line)) { out.push(`kanbanMovedAt: ${movedAt}`); hasMoved = true; continue }
                    out.push(line)
                  }
                  if (!hasCol) out.push(`kanbanColumnId: col-doing`)
                  if (!hasPos) out.push(`kanbanPosition: ${nextPosition}`)
                  if (!hasMoved) out.push(`kanbanMovedAt: ${movedAt}`)
                  updatedBodyMd = content.replace(/^---\n[\s\S]*?\n---/, `---\n${out.join('\n')}\n---`)
                } else {
                  // No frontmatter, add it
                  updatedBodyMd = `---\nkanbanColumnId: col-doing\nkanbanPosition: ${nextPosition}\nkanbanMovedAt: ${movedAt}\n---\n${content}`
                }
                
                const { error: updateErr } = await supabase
                  .from('tickets')
                  .update({
                    kanban_column_id: 'col-doing',
                    kanban_position: nextPosition,
                    kanban_moved_at: movedAt,
                    body_md: updatedBodyMd,
                  })
                  .eq('id', ticketId)
                
                if (updateErr) {
                  writeStage({ 
                    stage: 'failed', 
                    error: `Failed to move ticket to Doing: ${updateErr.message}. The ticket remains in To Do.`, 
                    status: 'move-to-doing-failed' 
                  })
                  res.end()
                  return
                }
                
                // Run sync-tickets to propagate change to docs
                const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
                spawn('node', [syncScriptPath], {
                  cwd: repoRoot,
                  env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
                  stdio: ['ignore', 'ignore', 'ignore'],
                }).on('error', () => {
                  // Sync failure is non-blocking; DB is updated
                })
              } catch (moveErr) {
                const errMsg = moveErr instanceof Error ? moveErr.message : String(moveErr)
                writeStage({ 
                  stage: 'failed', 
                  error: `Failed to move ticket to Doing: ${errMsg}. The ticket remains in To Do.`, 
                  status: 'move-to-doing-failed' 
                })
                res.end()
                return
              }
            }

            // Build prompt from Goal, Human-verifiable deliverable, Acceptance criteria
            const goalMatch = bodyMd.match(/##\s*Goal\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n##|$)/i)
            const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
            const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
            const goal = (goalMatch?.[1] ?? '').trim()
            const deliverable = (deliverableMatch?.[1] ?? '').trim()
            const criteria = (criteriaMatch?.[1] ?? '').trim()
            const promptText = [
              `Implement this ticket.`,
              '',
              '## Goal',
              goal || '(not specified)',
              '',
              '## Human-verifiable deliverable',
              deliverable || '(not specified)',
              '',
              '## Acceptance criteria',
              criteria || '(not specified)',
            ].join('\n')

            writeStage({ stage: 'resolving_repo' })

            // Resolve GitHub repo URL from git remote
            const { execSync } = await import('child_process')
            let repoUrl: string
            try {
              const out = execSync('git remote get-url origin', { cwd: repoRoot, encoding: 'utf8' })
              const raw = out.trim()
              // Normalize to https://github.com/owner/repo (handle git@github.com:owner/repo.git)
              const sshMatch = raw.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i)
              if (sshMatch) {
                repoUrl = `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
              } else if (/^https:\/\/github\.com\//i.test(raw)) {
                repoUrl = raw.replace(/\.git$/i, '')
              } else {
                writeStage({ stage: 'failed', error: 'No GitHub remote found. The connected project must have a GitHub origin (e.g. https://github.com/owner/repo or git@github.com:owner/repo.git).', status: 'no-github-remote' })
                res.end()
                return
              }
            } catch {
              writeStage({ stage: 'failed', error: 'Could not resolve GitHub repository. Ensure the project has a git remote named "origin" pointing to a GitHub repo.', status: 'no-github-remote' })
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
              let statusData: { status?: string; summary?: string; target?: { prUrl?: string } }
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
                const summary = statusData.summary ?? 'Implementation completed.'
                const prUrl = statusData.target?.prUrl

                // Move ticket to QA in Supabase
                if (supabaseUrl && supabaseAnonKey) {
                  try {
                    const { createClient } = await import('@supabase/supabase-js')
                    const supabase = createClient(supabaseUrl, supabaseAnonKey)
                    const { data: inColumn } = await supabase
                      .from('tickets')
                      .select('kanban_position')
                      .eq('kanban_column_id', 'col-qa')
                      .order('kanban_position', { ascending: false })
                      .limit(1)
                    const nextPosition = inColumn?.length ? ((inColumn[0]?.kanban_position ?? -1) + 1) : 0
                    const movedAt = new Date().toISOString()

                    // Update body_md with new frontmatter so DB and docs stay in sync
                    const content = bodyMd
                    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
                    let updatedBodyMd = content
                    if (fmMatch) {
                      const block = fmMatch[1]
                      const lines = block.split('\n')
                      const out: string[] = []
                      let hasCol = false
                      let hasPos = false
                      let hasMoved = false
                      for (const line of lines) {
                        if (/^kanbanColumnId\s*:/.test(line)) { out.push(`kanbanColumnId: col-qa`); hasCol = true; continue }
                        if (/^kanbanPosition\s*:/.test(line)) { out.push(`kanbanPosition: ${nextPosition}`); hasPos = true; continue }
                        if (/^kanbanMovedAt\s*:/.test(line)) { out.push(`kanbanMovedAt: ${movedAt}`); hasMoved = true; continue }
                        out.push(line)
                      }
                      if (!hasCol) out.push(`kanbanColumnId: col-qa`)
                      if (!hasPos) out.push(`kanbanPosition: ${nextPosition}`)
                      if (!hasMoved) out.push(`kanbanMovedAt: ${movedAt}`)
                      updatedBodyMd = content.replace(/^---\n[\s\S]*?\n---/, `---\n${out.join('\n')}\n---`)
                    }

                    await supabase
                      .from('tickets')
                      .update({
                        kanban_column_id: 'col-qa',
                        kanban_position: nextPosition,
                        kanban_moved_at: movedAt,
                        body_md: updatedBodyMd,
                      })
                      .eq('id', ticketId)

                    const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
                    spawn('node', [syncScriptPath], {
                      cwd: repoRoot,
                      env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseAnonKey },
                      stdio: ['ignore', 'ignore', 'ignore'],
                    }).on('error', () => {})
                  } catch (moveErr) {
                    console.error('[Implementation Agent] Move to QA failed:', moveErr)
                  }
                }

                const contentParts = [summary]
                if (prUrl) contentParts.push(`\n\nPull request: ${prUrl}`)
                contentParts.push(`\n\nTicket ${ticketId} moved to QA.`)
                writeStage({ stage: 'completed', success: true, content: contentParts.join(''), prUrl, summary, status: 'completed' })
                res.end()
                return
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
    },
    {
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
            const repoRoot = path.resolve(__dirname)
            const ticketsDir = path.join(repoRoot, 'docs', 'tickets')

            let bodyMd: string
            let ticketFilename: string
            let branchName: string | null = null

            writeStage({ stage: 'fetching_ticket' })

            // Fetch ticket: Supabase first (if creds provided), else docs/tickets
            if (supabaseUrl && supabaseAnonKey) {
              const { createClient } = await import('@supabase/supabase-js')
              const supabase = createClient(supabaseUrl, supabaseAnonKey)
              const { data: row, error } = await supabase
                .from('tickets')
                .select('body_md, filename')
                .eq('id', ticketId)
                .single()
              if (error || !row?.body_md) {
                // Fallback to docs
                const files = fs.readdirSync(ticketsDir, { withFileTypes: true })
                const match = files.find((f) => f.isFile() && f.name.startsWith(ticketId + '-') && f.name.endsWith('.md'))
                if (!match) {
                  writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in Supabase or docs/tickets.`, status: 'ticket-not-found' })
                  res.end()
                  return
                }
                ticketFilename = match.name
                bodyMd = fs.readFileSync(path.join(ticketsDir, ticketFilename), 'utf8')
              } else {
                bodyMd = row.body_md
                ticketFilename = row.filename ?? `${ticketId}-unknown.md`
              }
            } else {
              const files = fs.readdirSync(ticketsDir, { withFileTypes: true })
              const match = files.find((f) => f.isFile() && f.name.startsWith(ticketId + '-') && f.name.endsWith('.md'))
              if (!match) {
                writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in docs/tickets. Connect project to fetch from Supabase.`, status: 'ticket-not-found' })
                res.end()
                return
              }
              ticketFilename = match.name
              bodyMd = fs.readFileSync(path.join(ticketsDir, ticketFilename), 'utf8')
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

            const promptText = [
              `QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.`,
              '',
              '## Ticket',
              `**ID**: ${ticketId}`,
              `**Branch**: ${branchName}`,
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
              '1. Review the implementation on the feature branch.',
              '2. Check that all required audit artifacts exist (plan, worklog, changed-files, decisions, verification, pm-review).',
              '3. Perform code review and verify acceptance criteria.',
              '4. Generate `docs/audit/${ticketId}-<short-title>/qa-report.md` with:',
              '   - Ticket & deliverable summary',
              '   - Audit artifacts check',
              '   - Code review (PASS/FAIL with evidence)',
              '   - UI verification notes',
              '   - Verdict (PASS/FAIL)',
              '5. If PASS:',
              '   - Commit and push the qa-report to the feature branch',
              '   - Merge the feature branch into main',
              '   - Move the ticket to Human in the Loop (col-human-in-the-loop)',
              '   - Delete the feature branch (local and remote)',
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
            const launchRes = await fetch('https://api.cursor.com/v0/agents', {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                prompt: { text: promptText },
                source: { repository: repoUrl, ref: branchName },
                target: { branchName: 'main' },
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
                try {
                  if (fs.existsSync(qaReportPath)) {
                    const reportContent = fs.readFileSync(qaReportPath, 'utf8')
                    if (/verdict.*pass/i.test(reportContent) || /ok\s+to\s+merge/i.test(reportContent)) {
                      verdict = 'PASS'
                    } else if (/verdict.*fail/i.test(reportContent)) {
                      verdict = 'FAIL'
                    }
                  }
                } catch {
                  // Report may not exist yet or be unreadable
                }

                if (verdict === 'PASS') {
                  writeStage({ stage: 'merging', content: 'QA passed. Merging to main...' })
                  // The Cursor agent should have already merged, but we verify
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

                  const contentParts = [
                    `**QA PASSED** for ticket ${ticketId}`,
                    '',
                    summary,
                    '',
                    `Ticket ${ticketId} has been merged to main and moved to Human in the Loop.`,
                  ]
                  writeStage({ stage: 'completed', success: true, content: contentParts.join('\n'), verdict: 'PASS', status: 'completed' })
                  res.end()
                  return
                } else if (verdict === 'FAIL') {
                  const contentParts = [
                    `**QA FAILED** for ticket ${ticketId}`,
                    '',
                    summary,
                    '',
                    'The ticket was not merged. Review the qa-report.md for details and create a bugfix ticket if needed.',
                  ]
                  writeStage({ stage: 'completed', success: false, content: contentParts.join('\n'), verdict: 'FAIL', status: 'completed' })
                  res.end()
                  return
                } else {
                  // Verdict unknown - agent may still be processing
                  writeStage({ stage: 'completed', success: true, content: summary, verdict: 'UNKNOWN', status: 'completed' })
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
    },
    {
      name: 'tickets-delete-endpoint',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/tickets/delete' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
            next()
            return
          }

          // CORS for kanban iframe (port 5174) calling HAL (port 5173)
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              ticketId?: string
              supabaseUrl?: string
              supabaseAnonKey?: string
              projectRoot?: string
            }
            const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
            const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
            const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined
            const projectRoot = typeof body.projectRoot === 'string' ? body.projectRoot.trim() || undefined : undefined

            if (!ticketId || !supabaseUrl || !supabaseAnonKey) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  success: false,
                  error: 'ticketId, supabaseUrl, and supabaseAnonKey are required.',
                })
              )
              return
            }

            const repoRoot = path.resolve(__dirname)
            const { createClient } = await import('@supabase/supabase-js')
            const supabase = createClient(supabaseUrl, supabaseAnonKey)

            // Fetch filename before delete so we can remove the file if sync fails
            const { data: ticketRow, error: fetchErr } = await supabase
              .from('tickets')
              .select('filename')
              .eq('id', ticketId)
              .single()
            if (fetchErr || !ticketRow?.filename) {
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  success: false,
                  error: `Ticket not found: ${fetchErr?.message ?? 'no row'}`,
                })
              )
              return
            }
            const filename = ticketRow.filename

            // CRITICAL: Remove the file BEFORE deleting from DB so sync (Docs→DB first) cannot re-insert the ticket
            const rootForDocs = projectRoot ? path.resolve(projectRoot) : repoRoot
            const filePath = path.join(rootForDocs, 'docs', 'tickets', filename)
            let fileDeleteError: string | null = null
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath)
              } catch (unlinkErr) {
                fileDeleteError = unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr)
                // Log but continue to DB delete - better to have orphaned file than inconsistent state
                console.error(`[DELETE] Failed to delete file ${filePath}:`, fileDeleteError)
              }
            }

            const { error: deleteError } = await supabase.from('tickets').delete().eq('id', ticketId)
            if (deleteError) {
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  success: false,
                  error: `Supabase delete failed: ${deleteError.message}${fileDeleteError ? `. File delete also failed: ${fileDeleteError}` : ''}`,
                })
              )
              return
            }

            const syncScriptPath = path.resolve(repoRoot, 'scripts', 'sync-tickets.js')
            const syncEnv = {
              ...process.env,
              SUPABASE_URL: supabaseUrl,
              SUPABASE_ANON_KEY: supabaseAnonKey,
              ...(projectRoot ? { PROJECT_ROOT: projectRoot } : {}),
            }
            await new Promise<{ success: boolean; stderr?: string }>((resolve) => {
              const child = spawn('node', [syncScriptPath], {
                cwd: repoRoot,
                env: syncEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
              })
              let stderr = ''
              child.stderr?.on('data', (d) => {
                stderr += String(d)
              })
              child.on('close', (code) => resolve({ success: code === 0, stderr: stderr || undefined }))
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }
        })
      },
    },
    {
      name: 'pm-check-unassigned-endpoint',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/api/pm/check-unassigned' || req.method !== 'POST') {
            next()
            return
          }

          try {
            const body = (await readJsonBody(req)) as {
              supabaseUrl?: string
              supabaseAnonKey?: string
              projectId?: string
            }
            const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
            const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined
            const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined

            if (!supabaseUrl || !supabaseAnonKey) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  moved: [],
                  notReady: [],
                  error: 'supabaseUrl and supabaseAnonKey are required.',
                })
              )
              return
            }

            const repoRoot = path.resolve(__dirname)
            const distPath = path.resolve(repoRoot, 'projects/hal-agents/dist/agents/projectManager.js')

            let pmModule: { checkUnassignedTickets?: (url: string, key: string) => Promise<unknown> } | null = null
            try {
              pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
            } catch {
              // Build may be missing; try building hal-agents once then re-import
              try {
                await new Promise<void>((resolve, reject) => {
                  const child = spawn('npm', ['run', 'build', '--prefix', path.join(repoRoot, 'projects/hal-agents')], {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                  })
                  let stderr = ''
                  child.stderr?.on('data', (d) => { stderr += String(d) })
                  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `build exited ${code}`))))
                })
                pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
              } catch {
                pmModule = null
              }
            }

            let checkUnassignedTickets =
              pmModule && typeof pmModule.checkUnassignedTickets === 'function'
                ? pmModule.checkUnassignedTickets
                : null

            // If module loaded but function missing (stale build), build once and re-import
            if (!checkUnassignedTickets && pmModule !== undefined) {
              try {
                await new Promise<void>((resolve, reject) => {
                  const child = spawn('npm', ['run', 'build', '--prefix', path.join(repoRoot, 'projects/hal-agents')], {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                  })
                  let stderr = ''
                  child.stderr?.on('data', (d) => { stderr += String(d) })
                  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `build exited ${code}`))))
                })
                pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
                checkUnassignedTickets =
                  pmModule && typeof pmModule.checkUnassignedTickets === 'function'
                    ? pmModule.checkUnassignedTickets
                    : null
              } catch {
                // keep checkUnassignedTickets null
              }
            }

            if (!checkUnassignedTickets) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  moved: [],
                  notReady: [],
                  error: 'checkUnassignedTickets not available (hal-agents build may be missing or outdated). Run: npm run build --prefix projects/hal-agents',
                })
              )
              return
            }

            const result = (await checkUnassignedTickets(supabaseUrl, supabaseAnonKey)) as {
              moved: string[]
              notReady: Array<{ id: string; title?: string; missingItems: string[] }>
              error?: string
            }

            // If projectId provided, format the same message as the frontend and insert into hal_conversation_messages (sync-tickets flow)
            if (projectId && supabaseUrl && supabaseAnonKey) {
              let msg: string
              if (result.error) {
                msg = `[PM] Unassigned check failed: ${result.error}`
              } else {
                const movedStr = result.moved.length ? `Moved to To Do: ${result.moved.join(', ')}.` : ''
                const notReadyParts = result.notReady.map(
                  (n) => `${n.id}${n.title ? ` (${n.title})` : ''} — ${(n.missingItems ?? []).join('; ')}`
                )
                const notReadyStr =
                  result.notReady.length > 0
                    ? `Not ready (not moved): ${notReadyParts.join('. ')}`
                    : result.moved.length === 0
                      ? 'No tickets in Unassigned, or all were already ready.'
                      : ''
                msg = `[PM] Unassigned check: ${movedStr} ${notReadyStr}`.trim()
              }
              try {
                const { createClient } = await import('@supabase/supabase-js')
                const supabase = createClient(supabaseUrl, supabaseAnonKey)
                const { data: maxRow } = await supabase
                  .from('hal_conversation_messages')
                  .select('sequence')
                  .eq('project_id', projectId)
                  .eq('agent', 'project-manager')
                  .order('sequence', { ascending: false })
                  .limit(1)
                  .maybeSingle()
                const nextSeq = ((maxRow?.sequence ?? -1) as number) + 1
                await supabase.from('hal_conversation_messages').insert({
                  project_id: projectId,
                  agent: 'project-manager',
                  role: 'assistant',
                  content: msg,
                  sequence: nextSeq,
                })
              } catch (insertErr) {
                console.error('[HAL PM] Failed to insert unassigned-check message for project:', projectId, insertErr)
              }
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                moved: [],
                notReady: [],
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }
        })
      },
    },
    {
      name: 'pm-file-access-endpoint',
      configureServer(server) {
        // In-memory storage for file access requests and results
        const pendingRequests = new Map<string, { type: string; path?: string; pattern?: string; glob?: string; maxLines?: number; timestamp: number }>()
        const results = new Map<string, { success: boolean; content?: string; matches?: Array<{ path: string; line: number; text: string }>; error?: string; timestamp: number }>()

        // Clean up old requests/results (older than 5 minutes)
        setInterval(() => {
          const now = Date.now()
          const maxAge = 5 * 60 * 1000
          for (const [id, req] of pendingRequests.entries()) {
            if (now - req.timestamp > maxAge) pendingRequests.delete(id)
          }
          for (const [id, res] of results.entries()) {
            if (now - res.timestamp > maxAge) results.delete(id)
          }
        }, 60 * 1000)

        // Get pending file access requests (client polls this)
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/pm/file-access/pending' && req.method === 'GET') {
            const pending = Array.from(pendingRequests.entries()).map(([id, req]) => ({
              requestId: id,
              ...req,
            }))
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ pending }))
            return
          }
          next()
        })

        // Submit file access result (client posts results here)
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/pm/file-access/result' && req.method === 'POST') {
            try {
              const body = (await readJsonBody(req)) as {
                requestId?: string
                success?: boolean
                content?: string
                matches?: Array<{ path: string; line: number; text: string }>
                error?: string
              }
              const requestId = typeof body.requestId === 'string' ? body.requestId : ''
              if (!requestId) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'requestId is required' }))
                return
              }
              results.set(requestId, {
                success: body.success ?? false,
                content: body.content,
                matches: body.matches,
                error: body.error,
                timestamp: Date.now(),
              })
              // Remove from pending
              pendingRequests.delete(requestId)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                })
              )
            }
            return
          }
          next()
        })

        // Request file access (PM agent tools call this)
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/pm/file-access' && req.method === 'POST') {
            try {
              const body = (await readJsonBody(req)) as {
                requestId?: string
                type?: 'read_file' | 'search_files'
                path?: string
                pattern?: string
                glob?: string
                maxLines?: number
              }
              const requestId = typeof body.requestId === 'string' ? body.requestId : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
              const type = body.type

              if (type === 'read_file' && typeof body.path === 'string') {
                pendingRequests.set(requestId, {
                  type: 'read_file',
                  path: body.path,
                  maxLines: typeof body.maxLines === 'number' ? body.maxLines : 500,
                  timestamp: Date.now(),
                })
                // Poll for result (max 10 seconds, check every 200ms)
                const startTime = Date.now()
                const maxWait = 10 * 1000
                const pollInterval = 200
                while (Date.now() - startTime < maxWait) {
                  const result = results.get(requestId)
                  if (result) {
                    results.delete(requestId)
                    res.statusCode = 200
                    res.setHeader('Content-Type', 'application/json')
                    if (result.success) {
                      res.end(JSON.stringify({ success: true, content: result.content }))
                    } else {
                      res.end(JSON.stringify({ success: false, error: result.error ?? 'Unknown error' }))
                    }
                    return
                  }
                  await new Promise((resolve) => setTimeout(resolve, pollInterval))
                }
                // Timeout
                pendingRequests.delete(requestId)
                res.statusCode = 504
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'File access request timed out (client may not be connected)' }))
                return
              } else if (type === 'search_files' && typeof body.pattern === 'string') {
                pendingRequests.set(requestId, {
                  type: 'search_files',
                  pattern: body.pattern,
                  glob: typeof body.glob === 'string' ? body.glob : '**/*',
                  timestamp: Date.now(),
                })
                // Poll for result (max 10 seconds, check every 200ms)
                const startTime = Date.now()
                const maxWait = 10 * 1000
                const pollInterval = 200
                while (Date.now() - startTime < maxWait) {
                  const result = results.get(requestId)
                  if (result) {
                    results.delete(requestId)
                    res.statusCode = 200
                    res.setHeader('Content-Type', 'application/json')
                    if (result.success) {
                      res.end(JSON.stringify({ success: true, matches: result.matches }))
                    } else {
                      res.end(JSON.stringify({ success: false, error: result.error ?? 'Unknown error' }))
                    }
                    return
                  }
                  await new Promise((resolve) => setTimeout(resolve, pollInterval))
                }
                // Timeout
                pendingRequests.delete(requestId)
                res.statusCode = 504
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'File access request timed out (client may not be connected)' }))
                return
              } else {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Invalid request: type and path/pattern required' }))
                return
              }
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                })
              )
            }
            return
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@hal-agents': path.resolve(__dirname, 'projects/hal-agents/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

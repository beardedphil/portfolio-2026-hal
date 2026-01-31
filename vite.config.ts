import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { spawn } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'

// Load .env so OPENAI_API_KEY / OPENAI_MODEL are available in server middleware
loadEnv()

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

            // Import runPmAgent (and summarizeForContext) from hal-agents built dist
            let pmAgentModule: { runPmAgent?: (msg: string, config: object) => Promise<object>; summarizeForContext?: (msgs: unknown[], key: string, model: string) => Promise<string> } | null = null
            const distPath = path.resolve(__dirname, 'projects/hal-agents/dist/agents/projectManager.js')
            try {
              pmAgentModule = await import(pathToFileURL(distPath).href)
            } catch (err) {
              console.error('[HAL PM] Failed to load hal-agents dist:', err)
            }

            // When project DB (Supabase) is provided, fetch full history and build bounded context pack (summary + recent by content size)
            const RECENT_MAX_CHARS = 12_000
            let conversationContextPack: string | undefined
            if (projectId && supabaseUrl && supabaseAnonKey && pmAgentModule) {
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
                  if (needNewSummary && typeof pmAgentModule.summarizeForContext === 'function') {
                    summaryText = await pmAgentModule.summarizeForContext(older, key, model)
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

            if (!pmAgentModule?.runPmAgent) {
              // hal-agents#0003 not implemented yet - return stub response
              const stubResponse: PmAgentResponse = {
                reply: '[PM Agent] The PM agent core is not yet implemented. Waiting for hal-agents#0003 to be completed.\n\nYour message was: "' + message + '"',
                toolCalls: [],
                outboundRequest: {
                  _stub: true,
                  _note: 'hal-agents runPmAgent() not available yet',
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

            // Call the real PM agent (pass Supabase so create_ticket tool is available when project connected)
            const repoRoot = path.resolve(__dirname)
            const createTicketAvailable = !!(supabaseUrl && supabaseAnonKey)
            if (createTicketAvailable) {
              console.log('[HAL PM] create_ticket available for this request (Supabase creds provided)')
            } else {
              console.log('[HAL PM] create_ticket NOT available (no Supabase creds; connect project with .env)')
            }
            const result = (await pmAgentModule.runPmAgent(message, {
              repoRoot,
              openaiApiKey: key,
              openaiModel: model,
              conversationHistory,
              conversationContextPack,
              previousResponseId,
              ...(createTicketAvailable ? { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! } : {}),
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

            const { error: deleteError } = await supabase.from('tickets').delete().eq('id', ticketId)
            if (deleteError) {
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  success: false,
                  error: `Supabase delete failed: ${deleteError.message}`,
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
            const syncResult = await new Promise<{ success: boolean; stderr?: string }>((resolve) => {
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

            // If sync failed, remove the file directly so it cannot repopulate from docs on next sync
            if (!syncResult.success) {
              const rootForDocs = projectRoot ? path.resolve(projectRoot) : repoRoot
              const filePath = path.join(rootForDocs, 'docs', 'tickets', filename)
              if (fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath)
                } catch (_unlinkErr) {
                  // Still return success so client updates; ticket is already gone from DB
                }
              }
            }

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

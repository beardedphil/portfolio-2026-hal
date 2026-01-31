import path from 'path'
import { pathToFileURL } from 'url'
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
}

export default defineConfig({
  plugins: [
    react(),
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
            const projectId = typeof body.projectId === 'string' ? body.projectId : undefined
            const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl : undefined
            const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey : undefined

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

            // Call the real PM agent
            const repoRoot = path.resolve(__dirname)
            const result = await pmAgentModule.runPmAgent(message, {
              repoRoot,
              openaiApiKey: key,
              openaiModel: model,
              conversationHistory,
              conversationContextPack,
              previousResponseId,
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
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

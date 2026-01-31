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
            const body = (await readJsonBody(req)) as { message?: string }
            const message = body.message ?? ''

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

            // Import runPmAgent from hal-agents built dist (hal-agents must be built first; dev:hal runs build)
            // Node ESM requires file:// URL for dynamic import with absolute path (especially on Windows)
            let pmAgentModule: { runPmAgent?: (msg: string, config: object) => Promise<object> } | null = null
            const distPath = path.resolve(__dirname, 'projects/hal-agents/dist/agents/projectManager.js')
            try {
              const moduleUrl = pathToFileURL(distPath).href
              pmAgentModule = await import(moduleUrl)
            } catch (err) {
              // Dist missing or import failed - log so devs can see why, then return stub
              console.error('[HAL PM] Failed to load hal-agents dist:', err)
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

import path from 'path'
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
  ],
  resolve: {
    alias: {
      '@hal-agents': path.resolve(__dirname, 'projects/project-1/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

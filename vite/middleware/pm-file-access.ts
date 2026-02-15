import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers'

/** PM file access endpoint - handles file access requests from PM agent tools */
export function pmFileAccessPlugin(): Plugin {
  return {
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
  }
}

import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers/request-utils'

/**
 * Creates a simple middleware plugin that delegates to an API handler.
 * Handles CORS and error handling automatically.
 */
export function createSimpleMiddlewarePlugin(
  name: string,
  path: string,
  options: {
    method?: string | string[]
    allowOptions?: boolean
    cors?: boolean
  } = {}
): Plugin {
  const methods = Array.isArray(options.method) ? options.method : [options.method || 'POST']
  const allowOptions = options.allowOptions ?? true
  const cors = options.cors ?? true

  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname !== path || !methods.includes(req.method || '')) {
          if (allowOptions && req.method === 'OPTIONS' && pathname === path) {
            // Handle OPTIONS for CORS
          } else {
            next()
            return
          }
        }

        if (cors) {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', methods.join(', ') + (allowOptions ? ', OPTIONS' : ''))
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        }

        if (req.method === 'OPTIONS' && allowOptions) {
          res.statusCode = 204
          res.end()
          return
        }

        try {
          const handler = await import(`../../${path.replace(/^\//, '')}.js`)
          await handler.default(req, res)
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
  }
}

/**
 * Creates a middleware plugin that handles GET requests with query parameters.
 */
export function createGetMiddlewarePlugin(
  name: string,
  path: string,
  handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse, params: URLSearchParams) => Promise<void>
): Plugin {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const isGet = req.method === 'GET'
        const url = req.url ?? ''
        const pathname = url.split('?')[0]
        if (pathname !== path || !isGet) {
          next()
          return
        }
        try {
          const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '')
          await handler(req, res, params)
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
  }
}

import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers'

/** PM working memory GET endpoint */
export function pmWorkingMemoryGetPlugin(): Plugin {
  return {
    name: 'pm-working-memory-get-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const isGet = req.method === 'GET'
        const url = req.url ?? ''
        const pathname = url.split('?')[0]
        if (pathname !== '/api/pm/working-memory' || !isGet) {
          next()
          return
        }
        try {
          const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '')
          const projectId = params.get('projectId')?.trim() || undefined
          const agent = params.get('agent')?.trim() || 'project-manager'
          const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || undefined
          const supabaseAnonKey =
            process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined
          if (!projectId || !supabaseUrl || !supabaseAnonKey) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                success: false,
                error: 'projectId required; set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_*) in env.',
              })
            )
            return
          }
          const { createClient } = await import('@supabase/supabase-js')
          const supabase = createClient(supabaseUrl, supabaseAnonKey)
          const { data, error } = await supabase
            .from('hal_pm_working_memory')
            .select('*')
            .eq('project_id', projectId)
            .eq('agent', agent)
            .maybeSingle()
          if (error) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: error.message }))
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: true, workingMemory: data || null }))
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

/** PM refresh working memory endpoint (legacy) */
export function pmRefreshWorkingMemoryPlugin(): Plugin {
  return {
    name: 'pm-refresh-working-memory-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/pm/refresh-working-memory' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const handler = await import('../../api/pm/refresh-working-memory.js')
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

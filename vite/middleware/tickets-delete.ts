import path from 'path'
import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers/request-utils'

export function ticketsDeleteMiddleware(): Plugin {
  return {
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
            ticketPk?: string
            supabaseUrl?: string
            supabaseAnonKey?: string
            projectRoot?: string
          }
          const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
          const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
          const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
          const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

          if ((!ticketId && !ticketPk) || !supabaseUrl || !supabaseAnonKey) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                success: false,
                error: 'ticketPk (preferred) or ticketId, plus supabaseUrl and supabaseAnonKey are required.',
              })
            )
            return
          }

          const { createClient } = await import('@supabase/supabase-js')
          const supabase = createClient(supabaseUrl, supabaseAnonKey)

          // Supabase-only (0065): repo ticket files removed; delete from DB only.
          const del = ticketPk
            ? await supabase.from('tickets').delete().eq('pk', ticketPk)
            : await supabase.from('tickets').delete().eq('id', ticketId!)
          const deleteError = del.error
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
  }
}

import path from 'path'
import { pathToFileURL } from 'url'
import { spawn } from 'child_process'
import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers'

/** PM check unassigned endpoint */
export function pmCheckUnassignedPlugin(): Plugin {
  return {
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

          const repoRoot = path.resolve(__dirname, '../..')
          const distPath = path.resolve(repoRoot, 'agents/dist/agents/projectManager.js')

          let pmModule: { checkUnassignedTickets?: (url: string, key: string) => Promise<unknown> } | null = null
          try {
            pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
          } catch {
            // Build may be missing; try building hal-agents once then re-import
            try {
              await new Promise<void>((resolve, reject) => {
                const child = spawn('npm', ['run', 'build:agents'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
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
                const child = spawn('npm', ['run', 'build:agents'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
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
                error: 'checkUnassignedTickets not available (agents build may be missing or outdated). Run: npm run build:agents',
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
  }
}

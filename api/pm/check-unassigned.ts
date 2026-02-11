import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      supabaseUrl?: string
      supabaseAnonKey?: string
      projectId?: string
    }

    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined
    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        moved: [],
        notReady: [],
        error: 'supabaseUrl and supabaseAnonKey are required.',
      })
      return
    }

    const repoRoot = process.cwd()
    const distPath = path.resolve(repoRoot, 'node_modules/portfolio-2026-hal-agents/dist/agents/projectManager.js')

    let pmModule:
      | { checkUnassignedTickets?: (url: string, key: string) => Promise<unknown> }
      | null = null
    try {
      pmModule = (await import(pathToFileURL(distPath).href)) as typeof pmModule
    } catch {
      pmModule = null
    }

    const checkUnassignedTickets =
      pmModule && typeof pmModule.checkUnassignedTickets === 'function'
        ? pmModule.checkUnassignedTickets
        : null

    if (!checkUnassignedTickets) {
      json(res, 503, {
        moved: [],
        notReady: [],
        error:
          'checkUnassignedTickets not available (hal-agents dist missing). Ensure build runs `npm run build:agents` before deployment.',
      })
      return
    }

    const result = (await checkUnassignedTickets(supabaseUrl, supabaseAnonKey)) as {
      moved: string[]
      notReady: Array<{ id: string; title?: string; missingItems: string[] }>
      error?: string
    }

    // If projectId provided, insert a status message into hal_conversation_messages (parity with dev)
    if (projectId) {
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
      } catch {
        // non-fatal
      }
    }

    json(res, 200, result)
  } catch (err) {
    json(res, 500, {
      moved: [],
      notReady: [],
      error: err instanceof Error ? err.message : String(err),
    })
  }
}


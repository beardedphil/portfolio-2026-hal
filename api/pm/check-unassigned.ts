import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentials } from '../tickets/_shared.js'

const COL_UNASSIGNED = 'col-unassigned'
const COL_TODO = 'col-todo'

const PLACEHOLDER_RE = /<[^>]+>/g

function evaluateReady(bodyMd: string): { ready: boolean; missingItems: string[] } {
  const missing: string[] = []
  const md = bodyMd || ''
  const hasGoal = /(^|\n)##\s+Goal\s*\n/.test(md)
  const hasDeliverable = /(^|\n)##\s+Human-verifiable deliverable\s*\(UI-only\)\s*\n/.test(md)
  const hasAC = /(^|\n)##\s+Acceptance criteria\s*\(UI-only\)\s*\n/.test(md)
  const hasCheckbox = /(^|\n)\s*-\s*\[\s*\]\s+/.test(md)
  const hasConstraints = /(^|\n)##\s+Constraints\s*\n/.test(md)
  const hasNonGoals = /(^|\n)##\s+Non-goals\s*\n/.test(md)
  const placeholders = md.match(PLACEHOLDER_RE) ?? []

  if (!hasGoal) missing.push('Missing section: Goal')
  if (!hasDeliverable) missing.push('Missing section: Human-verifiable deliverable (UI-only)')
  if (!hasAC) missing.push('Missing section: Acceptance criteria (UI-only)')
  if (hasAC && !hasCheckbox) missing.push('Acceptance criteria must include - [ ] checkboxes')
  if (!hasConstraints) missing.push('Missing section: Constraints')
  if (!hasNonGoals) missing.push('Missing section: Non-goals')
  if (placeholders.length > 0) missing.push('Unresolved placeholders present')

  return { ready: missing.length === 0, missingItems: missing }
}

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

    const { supabaseUrl, supabaseAnonKey: supabaseKey } = parseSupabaseCredentials(body)
    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        moved: [],
        notReady: [],
        error:
          'Supabase server credentials are required (set SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY in server env).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const moved: string[] = []
    const notReady: Array<{ id: string; title?: string; missingItems: string[] }> = []

    const { data: rows, error: fetchError } = await supabase
      .from('tickets')
      .select('pk, id, display_id, repo_full_name, title, body_md, kanban_column_id, kanban_position')
      .eq('kanban_column_id', COL_UNASSIGNED)
      .order('kanban_position', { ascending: true })

    if (fetchError) {
      json(res, 200, { moved: [], notReady: [], error: `Supabase fetch: ${fetchError.message}` })
      return
    }

    // Compute current max position in To Do (global, since this endpoint is maintenance-only)
    const { data: todoRows } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', COL_TODO)
      .order('kanban_position', { ascending: false })
      .limit(1)
    let nextTodoPosition = 0
    if (Array.isArray(todoRows) && todoRows.length > 0) {
      const max = todoRows.reduce(
        (acc, r: any) => Math.max(acc, (r?.kanban_position ?? -1) as number),
        -1
      )
      nextTodoPosition = max + 1
    }

    const now = new Date().toISOString()
    for (const row of rows ?? []) {
      const displayId = (row as any).display_id ?? (row as any).id
      const title = (row as any).title ?? ''
      const bodyMd = (row as any).body_md ?? ''
      const ready = evaluateReady(bodyMd)
      if (!ready.ready) {
        notReady.push({ id: displayId, title, missingItems: ready.missingItems })
        continue
      }

      const upd = await supabase
        .from('tickets')
        .update({
          kanban_column_id: COL_TODO,
          kanban_position: nextTodoPosition++,
          kanban_moved_at: now,
        })
        .eq('pk', (row as any).pk)
      if (!upd.error) moved.push(displayId)
    }

    const result = { moved, notReady }

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
        const supabase = createClient(supabaseUrl, supabaseKey)
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


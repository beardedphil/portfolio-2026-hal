/**
 * Check unassigned tickets and move ready ones to To Do.
 */

import { createClient } from '@supabase/supabase-js'
import { evaluateTicketReady } from '../../lib/projectManagerHelpers.js'

export interface CheckUnassignedResult {
  moved: string[]
  notReady: Array<{ id: string; title?: string; missingItems: string[] }>
  error?: string
}

const COL_UNASSIGNED = 'col-unassigned'
const COL_TODO = 'col-todo'

function isUnknownColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  const msg = (e?.message ?? '').toLowerCase()
  return e?.code === '42703' || (msg.includes('column') && msg.includes('does not exist'))
}

/**
 * Check all tickets in Unassigned: evaluate readiness, move ready ones to To Do.
 * Returns list of moved ticket ids and list of not-ready tickets with missing items.
 * Used on app load and after sync so the PM can post a summary to chat.
 */
export async function checkUnassignedTickets(
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<CheckUnassignedResult> {
  const supabase = createClient(supabaseUrl.trim(), supabaseAnonKey.trim())
  const moved: string[] = []
  const notReady: Array<{ id: string; title?: string; missingItems: string[] }> = []

  try {
    // Repo-scoped safe mode (0079): use pk for updates; keep legacy fallback if schema isn't migrated.
    const r = await supabase
      .from('tickets')
      .select('pk, id, display_id, repo_full_name, ticket_number, title, body_md, kanban_column_id')
      .order('repo_full_name', { ascending: true })
      .order('ticket_number', { ascending: true })
    let rows = r.data as any[] | null
    let fetchError = r.error as any
    if (fetchError && isUnknownColumnError(fetchError)) {
      const legacy = await supabase
        .from('tickets')
        .select('id, title, body_md, kanban_column_id')
        .order('id', { ascending: true })
      rows = legacy.data as any[] | null
      fetchError = legacy.error as any
    }

    if (fetchError) {
      return { moved: [], notReady: [], error: `Supabase fetch: ${fetchError.message}` }
    }

    const unassigned = (rows ?? []).filter(
      (r: { kanban_column_id?: string | null }) =>
        r.kanban_column_id === COL_UNASSIGNED ||
        r.kanban_column_id == null ||
        r.kanban_column_id === ''
    )

    const now = new Date().toISOString()
    // Group by repo when available; otherwise treat as single bucket.
    const groups = new Map<string, any[]>()
    for (const row of unassigned) {
      const repo = (row as any).repo_full_name ?? 'legacy/unknown'
      const arr = groups.get(repo) ?? []
      arr.push(row)
      groups.set(repo, arr)
    }

    for (const [repo, rowsInRepo] of groups.entries()) {
      // Compute next position within this repo's To Do column if schema supports repo scoping; else global.
      let nextTodoPosition = 0
      const todoQ = supabase
        .from('tickets')
        .select('kanban_position')
        .eq('kanban_column_id', COL_TODO)
      const hasRepoCol = (rowsInRepo[0] as any).repo_full_name != null
      const todoR = hasRepoCol
        ? await todoQ.eq('repo_full_name', repo).order('kanban_position', { ascending: false }).limit(1)
        : await todoQ.order('kanban_position', { ascending: false }).limit(1)
      if (todoR.error && isUnknownColumnError(todoR.error)) {
        // Legacy schema: ignore repo filter
        const legacyTodo = await supabase
          .from('tickets')
          .select('kanban_position')
          .eq('kanban_column_id', COL_TODO)
          .order('kanban_position', { ascending: false })
          .limit(1)
        if (legacyTodo.error) {
          return { moved: [], notReady: [], error: `Supabase fetch: ${legacyTodo.error.message}` }
        }
        const max = (legacyTodo.data ?? []).reduce(
          (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
          0
        )
        nextTodoPosition = max + 1
      } else if (todoR.error) {
        return { moved: [], notReady: [], error: `Supabase fetch: ${todoR.error.message}` }
      } else {
        const max = (todoR.data ?? []).reduce(
          (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
          0
        )
        nextTodoPosition = max + 1
      }

      for (const row of rowsInRepo) {
        const id = (row as { id: string }).id
        const displayId = (row as any).display_id
        const title = (row as { title?: string }).title
        const bodyMd = (row as { body_md?: string }).body_md ?? ''
        const result = evaluateTicketReady(bodyMd)
        if (result.ready) {
          const updateQ = supabase
            .from('tickets')
            .update({
              kanban_column_id: COL_TODO,
              kanban_position: nextTodoPosition++,
              kanban_moved_at: now,
            })
          const upd = (row as any).pk
            ? await updateQ.eq('pk', (row as any).pk)
            : await updateQ.eq('id', id)
          if (!upd.error) moved.push(displayId ?? id)
        } else {
          notReady.push({ id: displayId ?? id, title, missingItems: result.missingItems })
        }
      }
    }

    return { moved, notReady }
  } catch (err) {
    return {
      moved: [],
      notReady: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

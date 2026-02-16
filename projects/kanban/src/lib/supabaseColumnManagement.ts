/**
 * Supabase column management functions extracted from App.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseKanbanColumnRow } from './canonicalizeColumns'
import { canonicalizeColumnRows } from './canonicalizeColumns'
import { DEFAULT_KANBAN_COLUMNS_SEED } from '../App.constants'

/**
 * Fetches and initializes kanban columns.
 * Returns the final column rows and whether columns were just initialized.
 */
export async function fetchAndInitializeColumns(
  client: SupabaseClient
): Promise<{ columns: SupabaseKanbanColumnRow[]; justInitialized: boolean; error: string | null }> {
  const { data: colRows, error: colError } = await client
    .from('kanban_columns')
    .select('id, title, position, created_at, updated_at')
    .order('position', { ascending: true })

  if (colError) {
    const eAny = colError as any
    const code = eAny?.code as string | undefined
    const msg = (eAny?.message as string | undefined) ?? String(colError)
    const lower = msg.toLowerCase()
    const isTableMissing =
      code === '42P01' ||
      lower.includes('relation') ||
      lower.includes('does not exist') ||
      lower.includes('could not find')
    
    if (isTableMissing) {
      return {
        columns: [],
        justInitialized: false,
        error: 'kanban_columns table missing',
      }
    }
    return {
      columns: [],
      justInitialized: false,
      error: msg,
    }
  }

  let finalColRows = (colRows ?? []) as SupabaseKanbanColumnRow[]
  let justInitialized = false

  if (finalColRows.length === 0) {
    // Initialize default columns
    for (const seed of DEFAULT_KANBAN_COLUMNS_SEED) {
      const { error: insErr } = await client.from('kanban_columns').insert(seed)
      if (insErr) {
        return {
          columns: [],
          justInitialized: false,
          error: 'Failed to initialize default columns: ' + (insErr.message ?? String(insErr)),
        }
      }
    }
    const { data: afterRows } = await client
      .from('kanban_columns')
      .select('id, title, position, created_at, updated_at')
      .order('position', { ascending: true })
    finalColRows = (afterRows ?? []) as SupabaseKanbanColumnRow[]
    justInitialized = true
  } else {
    // Migration: add missing columns for existing DBs
    const ids = new Set(finalColRows.map((c) => c.id))
    const toInsert: { id: string; title: string; position: number }[] = []
    if (!ids.has('col-qa')) {
      toInsert.push({ id: 'col-qa', title: 'QA', position: -1 })
    }
    if (!ids.has('col-human-in-the-loop')) {
      toInsert.push({ id: 'col-human-in-the-loop', title: 'Human in the Loop', position: -1 })
    }
    if (!ids.has('col-process-review')) {
      toInsert.push({ id: 'col-process-review', title: 'Process Review', position: -1 })
    }
    if (!ids.has('col-wont-implement')) {
      toInsert.push({ id: 'col-wont-implement', title: 'Will Not Implement', position: -1 })
    }
    if (toInsert.length > 0) {
      const maxPosition = Math.max(...finalColRows.map((c) => c.position), -1)
      for (let i = 0; i < toInsert.length; i++) {
        toInsert[i].position = maxPosition + 1 + i
      }
      for (const row of toInsert) {
        const { error: insErr } = await client.from('kanban_columns').insert(row)
        if (!insErr) {
          finalColRows = [...finalColRows, row as SupabaseKanbanColumnRow]
        }
      }
      finalColRows.sort((a, b) => a.position - b.position)
      const { data: afterRows } = await client
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
        .order('position', { ascending: true })
      if (afterRows?.length) finalColRows = afterRows as SupabaseKanbanColumnRow[]
    }
  }

  return {
    columns: canonicalizeColumnRows(finalColRows),
    justInitialized,
    error: null,
  }
}

/**
 * Remove duplicate rows in kanban_columns so there is exactly one row per column id.
 * Keeps the first row per id (by position, then created_at); deletes the rest by
 * deleting all rows for that id then re-inserting the one to keep.
 *
 * Usage: node scripts/dedupe-kanban-columns.js
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_* equivalents).
 * Run from project root.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const CANONICAL_ORDER = [
  'col-unassigned',
  'col-todo',
  'col-doing',
  'col-qa',
  'col-human-in-the-loop',
  'col-process-review',
  'col-done',
  'col-wont-implement',
]

async function main() {
  const client = createClient(url, key)
  const { data: rows, error: fetchError } = await client
    .from('kanban_columns')
    .select('id, title, position, created_at, updated_at')
    .order('position', { ascending: true })

  if (fetchError) {
    console.error('Fetch failed:', fetchError.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('No kanban_columns rows. Nothing to dedupe.')
    return
  }

  const byId = new Map()
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row)
    }
  }

  const duplicateIds = rows.filter((r) => {
    const first = byId.get(r.id)
    return first !== r
  }).map((r) => r.id)
  const uniqueDuplicateIds = [...new Set(duplicateIds)]

  if (uniqueDuplicateIds.length === 0) {
    console.log('No duplicate column ids found. Exiting.')
    return
  }

  console.log('Duplicate column ids:', uniqueDuplicateIds.join(', '))

  for (const id of uniqueDuplicateIds) {
    const keep = byId.get(id)
    const { error: delError } = await client.from('kanban_columns').delete().eq('id', id)
    if (delError) {
      console.error(`Delete failed for ${id}:`, delError.message)
      process.exit(1)
    }
    const position = CANONICAL_ORDER.indexOf(keep.id) >= 0 ? CANONICAL_ORDER.indexOf(keep.id) : keep.position
    const { error: insError } = await client.from('kanban_columns').insert({
      id: keep.id,
      title: keep.id === 'col-qa' ? 'Ready for QA' : keep.title,
      position,
    })
    if (insError) {
      console.error(`Insert failed for ${id}:`, insError.message)
      process.exit(1)
    }
    console.log(`Deduped ${id}: kept one row, removed duplicates.`)
  }

  console.log('Done. kanban_columns now has one row per column id.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

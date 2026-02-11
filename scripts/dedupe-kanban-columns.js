/**
 * Clean kanban_columns to exactly the 8 canonical columns.
 * 1) Dedupe: if any column id appears more than once, keep one row per id.
 * 2) Remove non-canonical columns: delete rows whose id is not in the canonical list
 *    (Unassigned, To-do, Doing, Ready for QA, Human in the Loop, Process Review, Done, Will Not Implement).
 *    Tickets in removed columns are moved to col-unassigned.
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

  const countById = new Map()
  for (const row of rows) {
    countById.set(row.id, (countById.get(row.id) ?? 0) + 1)
  }
  console.log(`kanban_columns: ${rows.length} row(s), ${countById.size} unique id(s)`)

  const canonicalSet = new Set(CANONICAL_ORDER)
  const byId = new Map()
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row)
    }
  }

  // Step 1: Dedupe (multiple rows with same id)
  const duplicateIds = [...countById.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  if (duplicateIds.length > 0) {
    console.log('Duplicate column ids:', duplicateIds.join(', '))
    for (const id of duplicateIds) {
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
  } else {
    console.log('No duplicate column ids found.')
  }

  // Step 2: Remove non-canonical columns (extra ids not in the 8 canonical)
  const nonCanonicalIds = rows.filter((r) => !canonicalSet.has(r.id)).map((r) => r.id)
  const uniqueNonCanonical = [...new Set(nonCanonicalIds)]

  if (uniqueNonCanonical.length > 0) {
    console.log('Non-canonical column ids (will remove):', uniqueNonCanonical.join(', '))
    for (const id of uniqueNonCanonical) {
      const { data: ticketsInCol } = await client
        .from('tickets')
        .select('pk')
        .eq('kanban_column_id', id)
      const count = ticketsInCol?.length ?? 0
      if (count > 0) {
        const { error: updateErr } = await client
          .from('tickets')
          .update({ kanban_column_id: 'col-unassigned', kanban_position: 0 })
          .eq('kanban_column_id', id)
        if (updateErr) {
          console.error(`Failed to move tickets from ${id} to col-unassigned:`, updateErr.message)
          process.exit(1)
        }
        console.log(`Moved ${count} ticket(s) from ${id} to Unassigned.`)
      }
      const { error: delError } = await client.from('kanban_columns').delete().eq('id', id)
      if (delError) {
        console.error(`Delete failed for ${id}:`, delError.message)
        process.exit(1)
      }
      console.log(`Removed non-canonical column: ${id}`)
    }
  } else {
    console.log('No non-canonical columns found.')
  }

  console.log('Done. kanban_columns now has only the 8 canonical columns.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

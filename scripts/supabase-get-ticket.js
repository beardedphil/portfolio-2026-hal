/**
 * Fetch one ticket from Supabase by id or display_id (for Cursor / scripts). Outputs JSON to stdout.
 *
 * Usage: node scripts/supabase-get-ticket.js <ticket-ref>
 *   ticket-ref  e.g. HAL-0080, 0080, 80
 *
 * Tries display_id first (e.g. HAL-0080), then id (e.g. 0080). Returns full row including body_md.
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 * Run from project root.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error(JSON.stringify({ error: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in .env' }))
  process.exit(1)
}

const ref = process.argv[2]?.trim()
if (!ref) {
  console.error(JSON.stringify({ error: 'Usage: node scripts/supabase-get-ticket.js <ticket-ref>' }))
  process.exit(1)
}

function normalizeId(ref) {
  const n = parseInt(ref.replace(/^.*?(\d{1,4})$/, '$1'), 10)
  return Number.isFinite(n) ? String(n).padStart(4, '0') : null
}

async function main() {
  const client = createClient(url, key)
  const id4 = normalizeId(ref)

  // Try display_id first (e.g. HAL-0080)
  if (ref.includes('-')) {
    const { data: byDisplayId, error: e1 } = await client
      .from('tickets')
      .select('pk, id, display_id, ticket_number, repo_full_name, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at')
      .eq('display_id', ref)
      .maybeSingle()
    if (!e1 && byDisplayId) {
      console.log(JSON.stringify(byDisplayId))
      return
    }
  }

  // Then by id (0080)
  if (id4) {
    const { data: byId, error: e2 } = await client
      .from('tickets')
      .select('pk, id, display_id, ticket_number, repo_full_name, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at')
      .eq('id', id4)
      .maybeSingle()
    if (!e2 && byId) {
      console.log(JSON.stringify(byId))
      return
    }
  }

  console.error(JSON.stringify({ error: `Ticket not found: ${ref}` }))
  process.exit(1)
}

main()

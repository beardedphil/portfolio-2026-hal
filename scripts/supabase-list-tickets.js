/**
 * List tickets from Supabase (for Cursor / scripts). Outputs JSON to stdout.
 *
 * Usage: node scripts/supabase-list-tickets.js [--repo REPO] [--column COL]
 *   --repo    Filter by repo_full_name (e.g. beardedphil/portfolio-2026-hal)
 *   --column  Filter by kanban_column_id (e.g. col-unassigned, col-todo, col-doing, col-qa)
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

const args = process.argv.slice(2)
let repo = null
let column = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--repo' && args[i + 1]) {
    repo = args[i + 1].trim()
    i++
  } else if (args[i] === '--column' && args[i + 1]) {
    column = args[i + 1].trim()
    i++
  }
}

async function main() {
  const client = createClient(url, key)
  let q = client
    .from('tickets')
    .select('pk, id, display_id, ticket_number, repo_full_name, filename, title, kanban_column_id, kanban_position')
    .order('ticket_number', { ascending: true, nullsFirst: false })
  if (repo) q = q.eq('repo_full_name', repo)
  if (column) q = q.eq('kanban_column_id', column)
  const { data, error } = await q
  if (error) {
    console.error(JSON.stringify({ error: error.message }))
    process.exit(1)
  }
  console.log(JSON.stringify({ tickets: data ?? [] }))
}

main()

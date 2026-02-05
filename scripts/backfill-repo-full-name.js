/**
 * One-time backfill: set repo_full_name on tickets that have 'legacy/unknown'
 * (e.g. after migration 0079 when tickets were created before repo-scoping).
 *
 * Use when the Kanban query by repo returns [] but you have tickets in DB
 * that were backfilled as legacy/unknown. Run once per repo.
 *
 * Usage: node scripts/backfill-repo-full-name.js <repo_full_name>
 * Example: node scripts/backfill-repo-full-name.js beardedphil/portfolio-2026-hal
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const repoFullName = process.argv[2]?.trim()
if (!repoFullName || repoFullName.includes(' ')) {
  console.error('Usage: node scripts/backfill-repo-full-name.js <repo_full_name>')
  console.error('Example: node scripts/backfill-repo-full-name.js beardedphil/portfolio-2026-hal')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ variants) in .env')
  process.exit(1)
}

const client = createClient(url, key)

async function main() {
  const { data: rows, error: selectError } = await client
    .from('tickets')
    .select('pk, display_id, ticket_number')
    .eq('repo_full_name', 'legacy/unknown')

  if (selectError) {
    console.error('Supabase select error:', selectError.message)
    process.exit(1)
  }

  const count = rows?.length ?? 0
  if (count === 0) {
    console.log('No tickets with repo_full_name = "legacy/unknown". Nothing to do.')
    return
  }

  const { error: updateError } = await client
    .from('tickets')
    .update({ repo_full_name: repoFullName })
    .eq('repo_full_name', 'legacy/unknown')

  if (updateError) {
    console.error('Supabase update error:', updateError.message)
    process.exit(1)
  }

  console.log(`Updated ${count} ticket(s) to repo_full_name = "${repoFullName}".`)
  console.log('Kanban should now show them when this repo is connected.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

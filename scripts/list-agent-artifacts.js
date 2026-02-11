/**
 * List agent_artifacts from Supabase (and optionally hal_agent_runs for a ticket).
 * Use this to confirm artifacts exist for a ticket.
 *
 * Usage: node scripts/list-agent-artifacts.js [ticketPk]
 *   ticketPk  Optional. UUID of the ticket (e.g. d4c90101-bddb-421f-981c-1c5884973467).
 *             If omitted, lists all artifacts.
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 * Run from project root.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error(JSON.stringify({ error: 'Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env' }))
  process.exit(1)
}

const ticketPk = process.argv[2]?.trim() || null

async function main() {
  const client = createClient(url, key)

  let artifactQuery = client
    .from('agent_artifacts')
    .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (ticketPk) {
    artifactQuery = artifactQuery.eq('ticket_pk', ticketPk)
  }
  const { data: artifacts, error: artErr } = await artifactQuery

  if (artErr) {
    console.error(JSON.stringify({ error: 'agent_artifacts query failed', message: artErr.message }, null, 2))
    process.exit(1)
  }

  let runs = null
  if (ticketPk) {
    const { data: runRows, error: runErr } = await client
      .from('hal_agent_runs')
      .select('run_id, agent_type, ticket_pk, display_id, status, created_at')
      .eq('ticket_pk', ticketPk)
      .order('created_at', { ascending: false })
    if (!runErr) runs = runRows
  }

  const out = {
    ticketPk: ticketPk || '(all)',
    artifactCount: artifacts?.length ?? 0,
    artifacts: artifacts ?? [],
    ...(runs != null && { runsForTicket: runs }),
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

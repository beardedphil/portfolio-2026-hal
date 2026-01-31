/**
 * Update a ticket's body_md in Supabase directly.
 * Use when a ticket needs to be fixed in the DB without editing docs/tickets/*.md
 * (e.g. so it passes Definition of Ready; see ticket 0038).
 *
 * Usage: node scripts/update-ticket-body-in-supabase.js [ticketId]
 *   ticketId  default 0037 (4-digit id)
 *
 * Reads body from docs/tickets/<id>-*.md, normalizes section headings to ## for
 * readiness evaluation, and updates Supabase. Requires .env with SUPABASE_URL and
 * SUPABASE_ANON_KEY (same as sync-tickets).
 *
 * Run from project root: node scripts/update-ticket-body-in-supabase.js 0037
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : path.resolve(__dirname, '..')
const ticketsDir = path.join(projectRoot, 'docs', 'tickets')

/** Section titles that evaluateTicketReady expects with ## (H2). */
const REQUIRED_SECTIONS = [
  'Goal (one sentence)',
  'Human-verifiable deliverable (UI-only)',
  'Acceptance criteria (UI-only)',
  'Constraints',
  'Non-goals',
]

/**
 * Normalize # Section to ## Section for required readiness headings.
 * evaluateTicketReady expects exactly "## Section Title" - see projectManager.ts.
 */
function normalizeBodyForReady(body) {
  let out = body
  for (const title of REQUIRED_SECTIONS) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`^# (${escaped})\\s*$`, 'gm'), `## ${title}`)
  }
  return out
}

function extractTicketId(filename) {
  const match = filename.match(/^(\d{4})/)
  return match ? match[1] : null
}

async function main() {
  const ticketId = (process.argv[2]?.trim() || '0037').replace(/^0+/, '0').padStart(4, '0')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (same as sync-tickets).')
    process.exit(1)
  }

  if (!fs.existsSync(ticketsDir)) {
    console.error('docs/tickets not found. Run from project root.')
    process.exit(1)
  }

  const files = fs.readdirSync(ticketsDir).filter((n) => n.endsWith('.md'))
  const match = files.find((n) => extractTicketId(n) === ticketId)
  if (!match) {
    console.error(`No ticket file found for id ${ticketId} in docs/tickets.`)
    process.exit(1)
  }

  const filePath = path.join(ticketsDir, match)
  let body_md = fs.readFileSync(filePath, 'utf8')
  body_md = normalizeBodyForReady(body_md)

  const client = createClient(url, key)

  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, filename, title')
    .eq('id', ticketId)
    .maybeSingle()

  if (fetchError) {
    console.error('Supabase fetch error:', fetchError.message)
    process.exit(1)
  }

  if (!row) {
    console.error(`Ticket ${ticketId} not found in Supabase. Run sync-tickets first to create it.`)
    process.exit(1)
  }

  const { error: updateError } = await client
    .from('tickets')
    .update({ body_md })
    .eq('id', ticketId)

  if (updateError) {
    console.error('Supabase update error:', updateError.message)
    process.exit(1)
  }

  // Write normalized body back to doc so future sync-tickets does not overwrite
  if (body_md !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, body_md, 'utf8')
    console.log(`Updated docs/tickets/${match} with normalized headings (## for readiness).`)
  }

  console.log(`Updated ticket ${ticketId} body_md in Supabase from docs/tickets/${match}.`)
  console.log('Kanban UI will reflect the change within ~10 seconds (poll interval).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

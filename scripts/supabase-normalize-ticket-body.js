/**
 * Fetch a ticket from Supabase, normalize body_md to Ready-to-start format (## headings + exact section titles), and update.
 * Use when a ticket fails readiness because it uses # or shortened section titles.
 *
 * Usage: node scripts/supabase-normalize-ticket-body.js <ticket-ref>
 *   ticket-ref  e.g. HAL-0080, 0080
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const ref = process.argv[2]?.trim()
if (!ref) {
  console.error('Usage: node scripts/supabase-normalize-ticket-body.js <ticket-ref>')
  process.exit(1)
}

const REPLACEMENTS = [
  [/^# Goal\s*$/gm, '## Goal (one sentence)'],
  [/^# Human-verifiable deliverable\s*$/gm, '## Human-verifiable deliverable (UI-only)'],
  [/^# Acceptance criteria\s*$/gm, '## Acceptance criteria (UI-only)'],
  [/^# Constraints\s*$/gm, '## Constraints'],
  [/^# Non-goals\s*$/gm, '## Non-goals'],
]

function normalizeBody(bodyMd) {
  let out = bodyMd.trim()
  for (const [re, replacement] of REPLACEMENTS) {
    out = out.replace(re, replacement)
  }
  return out
}

function normalizeId(ref) {
  const n = parseInt(ref.replace(/^.*?(\d{1,4})$/, '$1'), 10)
  return Number.isFinite(n) ? String(n).padStart(4, '0') : null
}

async function main() {
  const client = createClient(url, key)
  const id4 = normalizeId(ref)

  let row = null
  if (ref.includes('-')) {
    const { data } = await client.from('tickets').select('id, display_id, body_md').eq('display_id', ref).maybeSingle()
    row = data
  }
  if (!row && id4) {
    const { data } = await client.from('tickets').select('id, display_id, body_md').eq('id', id4).maybeSingle()
    row = data
  }
  if (!row) {
    console.error(`Ticket not found: ${ref}`)
    process.exit(1)
  }

  const normalized = normalizeBody(row.body_md ?? '')
  if (normalized === (row.body_md ?? '').trim()) {
    console.log('Body already normalized. No update.')
    return
  }

  const { error } = await client.from('tickets').update({ body_md: normalized }).eq('id', row.id)
  if (error) {
    console.error('Update failed:', error.message)
    process.exit(1)
  }
  console.log(`Updated ticket ${row.display_id ?? row.id} body_md for Ready-to-start format.`)
}

main()

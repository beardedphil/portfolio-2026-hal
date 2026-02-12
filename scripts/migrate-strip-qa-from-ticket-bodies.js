/**
 * One-time migration: strip QA Information / Implementation artifacts blocks from
 * every ticket's body_md in Supabase. QA is represented by artifacts only.
 *
 * Usage: node scripts/migrate-strip-qa-from-ticket-bodies.js [--dry-run]
 *   --dry-run  log what would be updated without writing
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const qaDivOpen = /<div[^>]*class=["'][^"']*qa-(info-section|section)(?:\s[^"']*)?["'][^>]*>/i

function stripQABlocksFromTicketBody(bodyMd) {
  if (!bodyMd || !bodyMd.trim()) return bodyMd
  const lines = bodyMd.split('\n')
  const out = []
  let inQABlock = false
  let inQAHtmlBlock = false
  let htmlDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inQAHtmlBlock) {
      const opens = (line.match(/<div[^>]*>/gi) || []).length
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth += opens - closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    if (qaDivOpen.test(line)) {
      inQAHtmlBlock = true
      htmlDepth = 1
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth -= closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    const looksLikeQAHeading =
      /^#{1,6}\s*QA\b/i.test(trimmed) ||
      /\*\*QA\s+Information\*\*/i.test(trimmed) ||
      /^<h[1-6][^>]*>[\s\S]*QA\s+Information[\s\S]*<\/h[1-6]>/i.test(trimmed) ||
      (/QA\s+Information/i.test(trimmed) && (trimmed.length < 50 || /^#?\s*\*?\*?/.test(trimmed)))
    const isOtherSectionHeading =
      /^#{1,6}\s/.test(trimmed) &&
      !/^#{1,6}\s*QA\b/i.test(trimmed) &&
      !/^#{1,6}\s*Implementation\s+artifacts\s*:?\s*$/i.test(trimmed)
    if (looksLikeQAHeading) {
      inQABlock = true
      continue
    }
    if (inQABlock) {
      if (isOtherSectionHeading) {
        inQABlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
    process.exit(1)
  }

  const client = createClient(url, key)
  const { data: tickets, error: fetchError } = await client
    .from('tickets')
    .select('id, display_id, body_md')

  if (fetchError) {
    console.error('Fetch error:', fetchError.message)
    process.exit(1)
  }

  const toUpdate = []
  for (const t of tickets || []) {
    const body = t.body_md ?? ''
    const stripped = stripQABlocksFromTicketBody(body)
    if (stripped !== body) toUpdate.push({ ...t, body_md: stripped })
  }

  if (toUpdate.length === 0) {
    console.log('No tickets need updating (no QA blocks found).')
    return
  }

  console.log(`Tickets to update: ${toUpdate.length}${dryRun ? ' (dry run)' : ''}`)
  for (const t of toUpdate) {
    console.log(`  ${t.display_id ?? t.id}`)
    if (dryRun) continue
    const { error } = await client.from('tickets').update({ body_md: t.body_md }).eq('id', t.id)
    if (error) {
      console.error(`  Failed: ${error.message}`)
      process.exit(1)
    }
  }
  if (!dryRun) console.log('Done. All listed tickets updated.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

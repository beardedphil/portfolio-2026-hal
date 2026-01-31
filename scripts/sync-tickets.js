/**
 * Sync tickets: docs/tickets/*.md ↔ Supabase tickets table.
 * Run from project root after writing a ticket: npm run sync-tickets
 *
 * Requires .env (or env) with SUPABASE_URL and SUPABASE_ANON_KEY.
 * - Docs → DB: upsert each doc ticket (create or update by id).
 * - DB → Docs: write docs/tickets/{filename} for each DB row not in docs.
 * - Then: set kanban_column_id = 'col-unassigned' for tickets with null.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const ticketsDir = path.join(projectRoot, 'docs', 'tickets')

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content }
  const afterFirst = content.slice(3)
  const closeIdx = afterFirst.indexOf('\n---')
  if (closeIdx === -1) return { frontmatter: {}, body: content }
  const block = afterFirst.slice(0, closeIdx).trim()
  const body = afterFirst.slice(closeIdx + 4).trimStart()
  const frontmatter = {}
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body }
}

function getKanban(frontmatter) {
  const out = {}
  if (frontmatter.kanbanColumnId != null && frontmatter.kanbanColumnId !== '') out.kanban_column_id = frontmatter.kanbanColumnId
  if (frontmatter.kanbanPosition != null && frontmatter.kanbanPosition !== '') {
    const n = parseInt(frontmatter.kanbanPosition, 10)
    if (!Number.isNaN(n)) out.kanban_position = n
  }
  if (frontmatter.kanbanMovedAt != null && frontmatter.kanbanMovedAt !== '') out.kanban_moved_at = frontmatter.kanbanMovedAt
  return out
}

function extractTicketId(filename) {
  const match = filename.match(/^(\d{4})/)
  return match ? match[1] : null
}

function extractTitle(content, filename) {
  const m = content.match(/\*\*Title\*\*:\s*(.+?)(?:\n|$)/)
  if (m) return m[1].trim()
  return filename.replace(/\.md$/i, '')
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or env) and run from project root.')
    process.exit(1)
  }

  if (!fs.existsSync(ticketsDir)) {
    console.error('docs/tickets not found. Run from project root.')
    process.exit(1)
  }

  const client = createClient(url, key)
  const filenames = fs.readdirSync(ticketsDir).filter((n) => n.endsWith('.md')).sort()
  const docTickets = []
  for (const name of filenames) {
    const id = extractTicketId(name)
    if (!id) {
      console.warn(`Skip ${name}: filename must start with 4 digits`)
      continue
    }
    const filePath = path.join(ticketsDir, name)
    const body_md = fs.readFileSync(filePath, 'utf8')
    const title = extractTitle(body_md, name)
    const { frontmatter } = parseFrontmatter(body_md)
    const kanban = getKanban(frontmatter)
    docTickets.push({
      id,
      filename: name,
      title,
      body_md,
      kanban_column_id: kanban.kanban_column_id ?? null,
      kanban_position: kanban.kanban_position ?? null,
      kanban_moved_at: kanban.kanban_moved_at ?? null,
    })
  }

  const { data: existingRows, error: fetchError } = await client
    .from('tickets')
    .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at')
    .order('id')

  if (fetchError) {
    console.error('Supabase fetch error:', fetchError.message)
    process.exit(1)
  }

  const existing = existingRows ?? []
  const docIds = new Set(docTickets.map((t) => t.id))
  let created = 0
  let updated = 0
  let skipped = 0

  for (const d of docTickets) {
    const row = {
      id: d.id,
      filename: d.filename,
      title: d.title,
      body_md: d.body_md,
      kanban_column_id: d.kanban_column_id,
      kanban_position: d.kanban_position,
      kanban_moved_at: d.kanban_moved_at,
    }
    const ex = existing.find((r) => r.id === d.id)
    if (!ex) {
      const { error } = await client.from('tickets').upsert(row, { onConflict: 'id' })
      if (error) {
        console.error('Upsert error for', d.id, error.message)
        process.exit(1)
      }
      created++
    } else if (ex.body_md !== d.body_md) {
      const { error } = await client.from('tickets').upsert(row, { onConflict: 'id' })
      if (error) {
        console.error('Upsert error for', d.id, error.message)
        process.exit(1)
      }
      updated++
    } else {
      skipped++
    }
  }

  let writtenToDocs = 0
  for (const row of existing) {
    if (docIds.has(row.id)) continue
    const filePath = path.join(ticketsDir, row.filename)
    fs.writeFileSync(filePath, row.body_md ?? '', 'utf8')
    writtenToDocs++
    console.log('Wrote docs/tickets/' + row.filename)
  }

  const { data: afterRows, error: refetchError } = await client
    .from('tickets')
    .select('id, kanban_column_id, kanban_position')
    .order('id')

  if (!refetchError && afterRows) {
    const KANBAN_COLUMN_IDS = ['col-unassigned', 'col-todo', 'col-doing', 'col-done']
    const unassigned = afterRows.filter(
      (r) =>
        r.kanban_column_id == null ||
        r.kanban_column_id === '' ||
        !KANBAN_COLUMN_IDS.includes(r.kanban_column_id)
    )
    const movedAt = new Date().toISOString()
    for (let i = 0; i < unassigned.length; i++) {
      await client
        .from('tickets')
        .update({
          kanban_column_id: 'col-unassigned',
          kanban_position: i,
          kanban_moved_at: movedAt,
        })
        .eq('id', unassigned[i].id)
    }
    if (unassigned.length > 0) {
      console.log('Set', unassigned.length, 'ticket(s) to Unassigned column')
    }
  }

  console.log(
    'Sync done. Docs→DB:',
    created,
    'created,',
    updated,
    'updated,',
    skipped,
    'skipped. DB→Docs:',
    writtenToDocs,
    'written.'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

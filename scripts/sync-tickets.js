/**
 * Sync tickets: Supabase is the source of truth. docs/tickets/*.md ↔ Supabase tickets table.
 * Run from project root: npm run sync-tickets
 *
 * Requires .env (or env) with SUPABASE_URL and SUPABASE_ANON_KEY.
 * Optional: HAL_PROJECT_ID (project id for PM conversation; defaults to repo folder name to match "Connect Project Folder"); HAL_CHECK_UNASSIGNED_URL (default http://localhost:5173/api/pm/check-unassigned).
 * - Docs → DB: upsert each doc ticket that ALREADY EXISTS in Supabase (update body_md, title, filename only; keep kanban from DB so UI moves are never reverted by sync).
 * - DB → Docs: write docs/tickets/{filename} for every ticket in Supabase with frontmatter from DB so docs match DB (Supabase wins).
 * - Delete orphans: remove local files for ticket IDs in docs but no longer in Supabase (Supabase is source of truth for deletions).
 * - Then: set kanban_column_id = 'col-unassigned' for tickets with null.
 * - After sync: POST to HAL check-unassigned so PM chat gets the result (ignored if HAL dev server not running).
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** When set (e.g. by repo-write-runner for an isolated worktree), use this as project root. */
const projectRoot = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : path.resolve(__dirname, '..')
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

/** Return body only (strip frontmatter if present). */
function getBodyOnly(content) {
  if (!content || !content.startsWith('---')) return content ?? ''
  const afterFirst = content.slice(3)
  const closeIdx = afterFirst.indexOf('\n---')
  if (closeIdx === -1) return content
  return afterFirst.slice(closeIdx + 4).trimStart()
}

/** Serialize full doc with frontmatter + body (Supabase kanban fields → frontmatter). */
function serializeDocWithKanban(row) {
  const body = getBodyOnly(row.body_md ?? '')
  const frontmatter = {}
  if (row.kanban_column_id != null && row.kanban_column_id !== '') frontmatter.kanbanColumnId = row.kanban_column_id
  if (row.kanban_position != null) frontmatter.kanbanPosition = String(row.kanban_position)
  if (row.kanban_moved_at != null && row.kanban_moved_at !== '') frontmatter.kanbanMovedAt = row.kanban_moved_at
  if (Object.keys(frontmatter).length === 0) return body
  const block = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n')
  return `---\n${block}\n---\n${body}`
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
      if (name !== 'README.md') console.warn(`Skip ${name}: filename must start with 4 digits`)
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
  let notReimported = 0

  for (const d of docTickets) {
    const ex = existing.find((r) => r.id === d.id)
    if (!ex) {
      // Do NOT re-import: ticket was deleted from DB; treat doc file as orphan (will be removed below)
      notReimported++
      continue
    }
    // Docs → DB: only push body_md, title, filename from docs. Keep kanban from DB so UI moves (and move-ticket-column) are never reverted by sync.
    const row = {
      id: d.id,
      filename: d.filename,
      title: d.title,
      body_md: d.body_md,
      kanban_column_id: ex.kanban_column_id,
      kanban_position: ex.kanban_position,
      kanban_moved_at: ex.kanban_moved_at,
    }
    if (ex.body_md !== d.body_md) {
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

  // Refetch all from DB so we write the current state (Supabase source of truth)
  const { data: refetchedRows, error: refetchError } = await client
    .from('tickets')
    .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at')
    .order('id')
  if (refetchError) {
    console.error('Supabase refetch after upsert:', refetchError.message)
    process.exit(1)
  }
  const refetched = refetchedRows ?? []

  let writtenToDocs = 0
  for (const row of refetched) {
    const filePath = path.join(ticketsDir, row.filename)
    const content = serializeDocWithKanban(row)
    fs.writeFileSync(filePath, content, 'utf8')
    writtenToDocs++
    console.log('Wrote docs/tickets/' + row.filename)
  }

  // Delete local files for ticket IDs in docs but no longer in Supabase (Supabase is source of truth)
  const refetchedIds = new Set(refetched.map((r) => r.id))
  let deletedFromDocs = 0
  for (const d of docTickets) {
    if (refetchedIds.has(d.id)) continue
    const filePath = path.join(ticketsDir, d.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      deletedFromDocs++
      console.log('Removed docs/tickets/' + d.filename)
    }
  }

  if (refetched.length > 0) {
    const KANBAN_COLUMN_IDS = [
  'col-unassigned',
  'col-todo',
  'col-doing',
  'col-qa',
  'col-human-in-the-loop',
  'col-done',
  'col-wont-implement',
]
    const unassigned = refetched.filter(
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
    updated,
    'updated,',
    skipped,
    'skipped',
    notReimported > 0 ? `, ${notReimported} orphaned (not re-imported)` : '',
    '. DB→Docs:',
    writtenToDocs,
    'written.',
    deletedFromDocs > 0 ? ` Deleted: ${deletedFromDocs}.` : ''
  )

  // Trigger HAL Unassigned check so PM chat gets the result (e.g. when sync runs from CLI)
  const halCheckUrl = process.env.HAL_CHECK_UNASSIGNED_URL || 'http://localhost:5173/api/pm/check-unassigned'
  // Default projectId to repo folder name so it matches "Connect Project Folder" (folderHandle.name)
  const projectId = process.env.HAL_PROJECT_ID || path.basename(projectRoot)
  try {
    const res = await fetch(halCheckUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabaseUrl: url,
        supabaseAnonKey: key,
        projectId,
      }),
    })
    if (!res.ok) {
      console.warn('HAL Unassigned check returned', res.status, '(HAL dev server may not be running)')
    }
  } catch (e) {
    // HAL dev server not running or unreachable — sync-tickets still succeeded
    console.warn('HAL Unassigned check skipped:', e instanceof Error ? e.message : String(e))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

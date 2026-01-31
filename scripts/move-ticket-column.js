/**
 * Move a ticket to a different Kanban column by updating Supabase, then the
 * markdown file's frontmatter, then running sync-tickets so the move persists
 * (docs and DB stay in sync; the board won't bounce back).
 *
 * Usage: node scripts/move-ticket-column.js [ticketId] [columnId]
 *   ticketId  default 0030 (4-digit id from docs/tickets/NNNN-....md)
 *   columnId  default col-human-in-the-loop (QA -> Human in the Loop)
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY (same as sync-tickets).
 * Run from project root: node scripts/move-ticket-column.js
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

function serializeDoc(frontmatter, body) {
  if (Object.keys(frontmatter).length === 0) return body
  const block = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n')
  return `---\n${block}\n---\n${body}`
}

function updateMarkdownKanban(filePath, updates) {
  const content = fs.readFileSync(filePath, 'utf8')
  const { frontmatter, body } = parseFrontmatter(content)
  const merged = { ...frontmatter }
  if (updates.kanbanColumnId !== undefined) merged.kanbanColumnId = updates.kanbanColumnId
  if (updates.kanbanPosition !== undefined) merged.kanbanPosition = String(updates.kanbanPosition)
  if (updates.kanbanMovedAt !== undefined) merged.kanbanMovedAt = updates.kanbanMovedAt
  fs.writeFileSync(filePath, serializeDoc(merged, body), 'utf8')
}

function runSyncTickets() {
  const syncScriptPath = path.resolve(projectRoot, 'scripts', 'sync-tickets.js')
  return new Promise((resolve, reject) => {
    const child = spawn('node', [syncScriptPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `sync-tickets exited ${code}`))
    })
  })
}

const ticketId = process.argv[2]?.trim() || '0030'
const targetColumnId = process.argv[3]?.trim() || 'col-human-in-the-loop'

async function main() {
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

  const client = createClient(url, key)

  // Resolve max position in target column so we append at end
  const { data: inColumn, error: fetchErr } = await client
    .from('tickets')
    .select('id, kanban_position')
    .eq('kanban_column_id', targetColumnId)
    .order('kanban_position', { ascending: false })
    .limit(1)

  if (fetchErr) {
    console.error('Failed to fetch tickets in target column:', fetchErr.message)
    process.exit(1)
  }

  const nextPosition = inColumn?.length
    ? (inColumn[0].kanban_position ?? -1) + 1
    : 0

  const movedAt = new Date().toISOString()
  const { error: updateErr } = await client
    .from('tickets')
    .update({
      kanban_column_id: targetColumnId,
      kanban_position: nextPosition,
      kanban_moved_at: movedAt,
    })
    .eq('id', ticketId)

  if (updateErr) {
    console.error('Failed to update ticket:', updateErr.message)
    process.exit(1)
  }

  // Get filename from DB so we can update the markdown file
  const { data: row, error: rowErr } = await client
    .from('tickets')
    .select('filename')
    .eq('id', ticketId)
    .single()

  if (rowErr || !row?.filename) {
    console.error('Failed to get ticket filename:', rowErr?.message ?? 'no row')
    process.exit(1)
  }

  const filePath = path.join(ticketsDir, row.filename)
  if (!fs.existsSync(filePath)) {
    console.error('Ticket file not found:', filePath)
    process.exit(1)
  }

  updateMarkdownKanban(filePath, {
    kanbanColumnId: targetColumnId,
    kanbanPosition: nextPosition,
    kanbanMovedAt: movedAt,
  })
  console.log('Updated docs/tickets/' + row.filename + ' frontmatter.')

  await runSyncTickets()
  console.log('Ran sync-tickets (docs ↔ DB).')

  console.log(`Moved ticket ${ticketId} to column ${targetColumnId} at position ${nextPosition}.`)
  console.log('Kanban board will show the change on next poll (~10s) or after refresh.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

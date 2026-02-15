#!/usr/bin/env node
/**
 * Cancel all active Cursor cloud agents using Supabase + Cursor API directly.
 * Use this when the deployed app doesn't expose the cancel API yet, or to run
 * against the same Supabase the deployed app uses (cancels agents everywhere).
 *
 * Loads .env from project root. Requires:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)
 *   CURSOR_API_KEY (or VITE_CURSOR_API_KEY)
 *
 *   node scripts/cancel-all-agents-standalone.js
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const path = resolve(root, '.env')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = (m[2] || '').trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1).replace(/\\(.)/g, '$1')
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const supabaseUrl =
  process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim()
const cursorKey =
  process.env.CURSOR_API_KEY?.trim() || process.env.VITE_CURSOR_API_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env: SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY)')
  process.exit(1)
}
if (!cursorKey) {
  console.error('Missing Cursor API key: CURSOR_API_KEY or VITE_CURSOR_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const auth = Buffer.from(`${cursorKey}:`).toString('base64')

async function main() {
  const { data: runs, error } = await supabase
    .from('hal_agent_runs')
    .select('run_id, cursor_agent_id, status, progress, display_id')
    .in('status', ['created', 'launching', 'polling'])
    .not('cursor_agent_id', 'is', null)

  if (error) {
    console.error('Failed to list runs:', error.message)
    process.exit(1)
  }

  if (!runs?.length) {
    console.log('No active agent runs to cancel.')
    return
  }

  console.log(`Found ${runs.length} active run(s). Cancelling...`)

  let cancelled = 0
  for (const run of runs) {
    const cid = run.cursor_agent_id
    const res = await fetch(`https://api.cursor.com/v0/agents/${cid}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    })
    const label = run.display_id || run.run_id
    if (!res.ok) {
      const text = await res.text()
      console.error(`  ${label}: Cursor API ${res.status} ${text.slice(0, 80)}`)
      continue
    }
    const progress = Array.isArray(run.progress) ? run.progress : []
    progress.push({ at: new Date().toISOString(), message: 'Cancelled by user (standalone script).' })
    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'failed',
        error: 'Cancelled by user.',
        progress,
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', run.run_id)
    cancelled++
    console.log(`  Cancelled ${label}`)
  }

  console.log(`Done. Cancelled ${cancelled}/${runs.length} agent run(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

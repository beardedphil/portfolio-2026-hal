/**
 * List tickets in the Human in the Loop (HITL) column using the HAL API
 * or, if the API is unavailable, by querying Supabase directly.
 *
 * Usage: node scripts/list-hitl-tickets.js
 *
 * Environment:
 *   HAL_URL  Optional. Base URL for HAL (e.g. https://your-app.vercel.app or http://localhost:3000).
 *            If unset or endpoint fails, falls back to Supabase using SUPABASE_URL and SUPABASE_ANON_KEY.
 *   SUPABASE_URL, SUPABASE_ANON_KEY  Used by the API or for direct fallback.
 */

import 'dotenv/config'

const HAL_URL = (process.env.HAL_URL || '').trim() || 'http://localhost:3000'
const COLUMN_NAME = 'Human in the Loop'

async function viaApi() {
  const url = `${HAL_URL.replace(/\/$/, '')}/api/tickets/list-by-column`
  const body = {
    columnName: COLUMN_NAME,
    limit: 500,
    offset: 0,
  }
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (supabaseUrl && supabaseKey) {
    body.supabaseUrl = supabaseUrl
    body.supabaseAnonKey = supabaseKey
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  if (!data.success) {
    throw new Error(data.error || 'API returned success: false')
  }
  return data
}

async function viaSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env for direct Supabase fallback.')
  }
  const supabase = createClient(url, key)

  const { data: columns, error: colErr } = await supabase.from('kanban_columns').select('id, title')
  if (colErr) throw new Error(`Failed to fetch columns: ${colErr.message}`)

  const hitl = (columns || []).find(
    (c) => String(c.title || '').toLowerCase().includes('human')
  )
  if (!hitl?.id) {
    return { success: true, columnId: null, count: 0, tickets: [] }
  }

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('pk, id, display_id, title, repo_full_name, kanban_column_id, kanban_position, kanban_moved_at')
    .eq('kanban_column_id', hitl.id)
    .order('kanban_position', { ascending: true })

  if (error) throw new Error(`Failed to fetch tickets: ${error.message}`)

  return {
    success: true,
    columnId: hitl.id,
    columnName: hitl.title,
    count: (tickets || []).length,
    tickets: tickets || [],
  }
}

async function main() {
  let data
  try {
    data = await viaApi()
  } catch (e) {
    console.error('HAL API request failed:', e.message)
    console.error('Falling back to Supabase...')
    data = await viaSupabase()
  }

  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

/**
 * Supabase ticket update functions extracted from App.tsx
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Updates a ticket's kanban fields in Supabase.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function updateTicketKanban(
  url: string,
  key: string,
  pk: string,
  updates: { kanban_column_id?: string; kanban_position?: number; kanban_moved_at?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = url?.trim()
  const k = key?.trim()
  if (!u || !k) {
    return { ok: false, error: 'Supabase not configured (URL/key missing). Connect first.' }
  }
  try {
    const client = createClient(u, k)
    const { error } = await client.from('tickets').update(updates).eq('pk', pk)
    if (error) {
      const msg = error.message ?? String(error)
      return { ok: false, error: msg }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

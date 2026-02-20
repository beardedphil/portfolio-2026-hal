import type { SupabaseClient } from '@supabase/supabase-js'

export type RunEventType =
  | 'text_delta'
  | 'stage'
  | 'progress'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'done'

export type RunEventRow = {
  id: number
  run_id: string
  type: RunEventType
  payload: unknown
  created_at: string
}

export async function appendRunEvent(
  supabase: SupabaseClient,
  runId: string,
  type: RunEventType,
  payload: unknown
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('hal_agent_run_events')
      .insert({ run_id: runId, type, payload })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return { ok: false, error: error?.message ?? 'Failed to insert run event.' }

    const id = Number((data as any).id)
    if (!Number.isFinite(id)) return { ok: false, error: 'Invalid event id returned from Supabase.' }

    await supabase.from('hal_agent_runs').update({ last_event_id: id }).eq('run_id', runId)
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function appendRunEvents(
  supabase: SupabaseClient,
  runId: string,
  events: Array<{ type: RunEventType; payload: unknown }>
): Promise<{ ok: true; lastId: number | null } | { ok: false; error: string }> {
  if (events.length === 0) return { ok: true, lastId: null }
  try {
    const rows = events.map((e) => ({ run_id: runId, type: e.type, payload: e.payload }))
    const { data, error } = await supabase.from('hal_agent_run_events').insert(rows).select('id')
    if (error) return { ok: false, error: error.message }

    const lastId =
      Array.isArray(data) && data.length
        ? Number((data[data.length - 1] as any)?.id)
        : null
    if (lastId != null && Number.isFinite(lastId)) {
      await supabase.from('hal_agent_runs').update({ last_event_id: lastId }).eq('run_id', runId)
    }
    return { ok: true, lastId: lastId != null && Number.isFinite(lastId) ? lastId : null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}


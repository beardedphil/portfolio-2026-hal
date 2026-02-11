import { createClient } from '@supabase/supabase-js'

export type AgentType = 'implementation' | 'qa'

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    throw new Error('Supabase server env is missing (SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY).')
  }
  return createClient(url, key)
}

export function getCursorApiKey(): string {
  const key = (process.env.CURSOR_API_KEY || process.env.VITE_CURSOR_API_KEY || '').trim()
  if (!key) throw new Error('Cursor API is not configured (CURSOR_API_KEY).')
  return key
}

export function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 140)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

export function appendProgress(progress: any[] | null | undefined, message: string) {
  const arr = Array.isArray(progress) ? progress.slice(-49) : []
  arr.push({ at: new Date().toISOString(), message })
  return arr
}

/** Upsert one artifact: update body_md if row exists, otherwise insert. */
export async function upsertArtifact(
  supabase: ReturnType<typeof createClient>,
  ticketPk: string,
  repoFullName: string,
  agentType: string,
  title: string,
  bodyMd: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('agent_artifacts')
    .select('artifact_id')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', agentType)
    .eq('title', title)
    .maybeSingle()
  if (existing) {
    await supabase.from('agent_artifacts').update({ body_md: bodyMd }).eq('artifact_id', (existing as any).artifact_id)
  } else {
    await supabase.from('agent_artifacts').insert({
      ticket_pk: ticketPk,
      repo_full_name: repoFullName,
      agent_type: agentType,
      title,
      body_md: bodyMd,
    })
  }
}


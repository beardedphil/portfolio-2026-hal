import type { SupabaseClient } from '@supabase/supabase-js'

export type HalAgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'
export type HalProvider = 'cursor' | 'openai'

export type HalAgentRunRow = {
  run_id: string
  agent_type: HalAgentType
  repo_full_name: string
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  cursor_agent_id: string | null
  cursor_status: string | null
  pr_url: string | null
  summary: string | null
  error: string | null
  status: string
  current_stage: string | null
  progress: unknown
  provider?: string | null
  provider_run_id?: string | null
  model?: string | null
  input_json?: unknown
  output_json?: unknown
  last_event_id?: number | null
  created_at?: string
  updated_at?: string
  finished_at?: string | null
}

export type AdvanceRunParams = {
  supabase: SupabaseClient
  run: HalAgentRunRow
  budgetMs: number
}

export type AdvanceRunResult =
  | { ok: true; done: boolean; runPatch?: Partial<HalAgentRunRow> }
  | { ok: false; error: string }

export type RunProvider = {
  name: HalProvider
  canHandle: (agentType: HalAgentType) => boolean
  advance: (params: AdvanceRunParams) => Promise<AdvanceRunResult>
}


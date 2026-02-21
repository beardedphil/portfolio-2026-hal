-- Ticket HAL-0748: Add context_bundle_id to hal_agent_runs
-- Goal: Ensure every agent run is executed only with the provided deterministic Context Bundle JSON
-- and cannot access or depend on chat history.

-- Add context_bundle_id column to link agent runs to their context bundles
alter table public.hal_agent_runs
  add column if not exists context_bundle_id uuid null
    references public.context_bundles(bundle_id) on delete set null;

-- Create index for efficient lookups
create index if not exists hal_agent_runs_context_bundle_id_idx
  on public.hal_agent_runs(context_bundle_id);

-- Add comment explaining the purpose
comment on column public.hal_agent_runs.context_bundle_id is 
  'The context bundle used for this agent run. Required for deterministic execution without chat history.';

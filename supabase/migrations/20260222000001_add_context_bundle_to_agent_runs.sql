-- Ticket HAL-0748: Add context bundle tracking to agent runs
-- Ensures every agent run is executed only with the provided deterministic Context Bundle JSON

-- Add context bundle tracking columns to hal_agent_runs
alter table public.hal_agent_runs
  add column if not exists context_bundle_id uuid null,
  add column if not exists context_bundle_checksum text null;

-- Add foreign key constraint to context_bundles
alter table public.hal_agent_runs
  add constraint hal_agent_runs_context_bundle_fk 
  foreign key (context_bundle_id) references context_bundles(bundle_id) on delete set null;

-- Add index for efficient lookups
create index if not exists hal_agent_runs_context_bundle_idx
  on public.hal_agent_runs(context_bundle_id);

-- Add index for checksum lookups
create index if not exists hal_agent_runs_context_bundle_checksum_idx
  on public.hal_agent_runs(context_bundle_checksum);

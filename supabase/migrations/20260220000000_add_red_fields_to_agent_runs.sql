-- Ticket HAL-0760: Add RED identifier fields to hal_agent_runs
--
-- Goal:
-- - Track which RED version was used for each agent run
-- - Enable verification that runs use RED-derived structured fields
-- - Support showing RED identifier in run metadata/details

alter table public.hal_agent_runs
  add column if not exists red_id uuid null,
  add column if not exists red_version integer null;

-- Add foreign key constraint to hal_red_documents
alter table public.hal_agent_runs
  add constraint hal_agent_runs_red_fk 
  foreign key (red_id) 
  references hal_red_documents(red_id) 
  on delete set null;

-- Add index for querying runs by RED
create index if not exists idx_hal_agent_runs_red_id 
  on public.hal_agent_runs(red_id);

-- Add comment for documentation
comment on column public.hal_agent_runs.red_id is 'RED document identifier used for this agent run. NULL if no valid RED was available at launch time.';
comment on column public.hal_agent_runs.red_version is 'RED version number used for this agent run. NULL if no valid RED was available at launch time.';

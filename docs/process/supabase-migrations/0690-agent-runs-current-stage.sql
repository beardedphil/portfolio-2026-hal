-- Ticket 0690: Add current_stage field to hal_agent_runs
--
-- Goal:
-- - Track detailed stage progression (preparing, fetching_ticket, resolving_repo, launching, polling, etc.)
-- - Enable Active Work status indicator to show step-by-step progress
-- - Persist stage so it's visible after navigation

alter table public.hal_agent_runs
  add column if not exists current_stage text null;

comment on column public.hal_agent_runs.current_stage is 'Current detailed stage of the agent run (e.g. preparing, fetching_ticket, resolving_repo, launching, polling, completed, failed). Used for Active Work status indicator.';

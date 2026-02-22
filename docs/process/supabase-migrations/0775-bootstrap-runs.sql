-- Ticket 0775: Bootstrap runs persistence
--
-- Goal:
-- - Store bootstrap run state (status, current step, step history, logs)
-- - Enable resumable, idempotent bootstrap workflow
-- - Support retry of failed steps without re-running completed steps
-- - Persist state across browser refreshes

create extension if not exists pgcrypto;

create table if not exists public.bootstrap_runs (
  id uuid primary key default gen_random_uuid(),
  
  -- Project identifier (e.g., repo full name or project slug)
  project_id text not null,
  
  -- Run status: pending | running | succeeded | failed
  status text not null default 'pending',
  
  -- Current step being executed (nullable when no step is active)
  current_step text,
  
  -- Step execution history (array of step records)
  step_history jsonb not null default '[]'::jsonb,
  
  -- Log entries (array of log records)
  logs jsonb not null default '[]'::jsonb,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes for efficient queries
create index if not exists bootstrap_runs_project_idx
  on public.bootstrap_runs (project_id, created_at desc);

create index if not exists bootstrap_runs_status_idx
  on public.bootstrap_runs (project_id, status)
  where status in ('pending', 'running');

-- Auto-update updated_at timestamp
create or replace function public.bootstrap_runs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bootstrap_runs_touch on public.bootstrap_runs;
create trigger bootstrap_runs_touch
before update on public.bootstrap_runs
for each row execute function public.bootstrap_runs_touch_updated_at();

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.bootstrap_runs enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
create policy "Allow all operations on bootstrap_runs"
  on public.bootstrap_runs
  for all
  using (true)
  with check (true);

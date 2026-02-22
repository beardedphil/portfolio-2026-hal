-- Migration: Create bootstrap_run table (0775)
-- Stores bootstrap workflow state with resumable, idempotent steps
-- Goal: Persist Roadmap T1 bootstrap workflow as a state machine with durable logs

create extension if not exists pgcrypto;

create table if not exists public.bootstrap_runs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier (e.g., repo name or project name)
  
  status text not null default 'pending', -- pending | running | succeeded | failed
  current_step text null, -- Current step identifier (e.g., 'ensure_repo_initialized', 'create_supabase_project', etc.)
  
  -- Step history: array of step execution records
  step_history jsonb not null default '[]'::jsonb,
  -- Each step record: { step: string, status: 'pending' | 'running' | 'succeeded' | 'failed', 
  --                     started_at: timestamp, completed_at: timestamp | null,
  --                     error_summary: string | null, error_details: string | null }
  
  -- Overall logs: array of log entries
  logs jsonb not null default '[]'::jsonb,
  -- Each log entry: { timestamp: timestamp, level: 'info' | 'error' | 'warning', message: string }
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

-- Index for fast lookups by project
create index if not exists idx_bootstrap_runs_project_id on public.bootstrap_runs(project_id, created_at desc);

-- Index for finding active runs
create index if not exists idx_bootstrap_runs_status on public.bootstrap_runs(status) where status in ('pending', 'running');

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

-- Enable RLS (Row Level Security)
alter table public.bootstrap_runs enable row level security;

-- Policy: Allow all operations (adjust as needed for your security requirements)
create policy "Allow all operations on bootstrap_runs" on public.bootstrap_runs
  for all
  using (true)
  with check (true);

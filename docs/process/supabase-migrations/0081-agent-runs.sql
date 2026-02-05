-- Ticket 0081: Durable agent runs (launch + poll)
--
-- Goal:
-- - Support long-running Implementation/QA runs in serverless
-- - Store Cursor agent id + status in Supabase
-- - Allow UI to poll status without holding an HTTP stream open

create extension if not exists pgcrypto;

create table if not exists public.hal_agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  agent_type text not null, -- implementation | qa

  repo_full_name text not null,
  ticket_pk uuid null,
  ticket_number int null,
  display_id text null,

  cursor_agent_id text null,
  cursor_status text null,
  pr_url text null,
  summary text null,
  error text null,

  status text not null default 'created', -- created | launching | polling | finished | failed
  progress jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists hal_agent_runs_repo_created_idx
  on public.hal_agent_runs (repo_full_name, created_at desc);

create index if not exists hal_agent_runs_ticket_idx
  on public.hal_agent_runs (repo_full_name, ticket_number, agent_type, created_at desc);

create or replace function public.hal_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hal_agent_runs_touch on public.hal_agent_runs;
create trigger hal_agent_runs_touch
before update on public.hal_agent_runs
for each row execute function public.hal_touch_updated_at();

alter table public.hal_agent_runs disable row level security;


-- Async streaming agent runs: events table + provider columns
-- Goal:
-- - Persist append-only run events for resumable streaming
-- - Extend hal_agent_runs to support multiple providers (OpenAI, Cursor, future)

create extension if not exists pgcrypto;

-- Ensure base run table exists (older environments may have applied this via manual SQL).
create table if not exists public.hal_agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  agent_type text not null, -- implementation | qa | project-manager | process-review

  repo_full_name text not null,
  ticket_pk uuid null,
  ticket_number int null,
  display_id text null,

  cursor_agent_id text null,
  cursor_status text null,
  pr_url text null,
  summary text null,
  error text null,

  status text not null default 'created', -- created | launching | polling | running | completed | failed
  current_stage text null,
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

-- Provider-agnostic run metadata
alter table public.hal_agent_runs
  add column if not exists provider text null, -- openai | cursor | future
  add column if not exists provider_run_id text null,
  add column if not exists model text null,
  add column if not exists input_json jsonb null,
  add column if not exists output_json jsonb null,
  add column if not exists last_event_id bigint null;

-- Append-only event log for streamed output + progress
create table if not exists public.hal_agent_run_events (
  id bigserial primary key,
  run_id uuid not null references public.hal_agent_runs(run_id) on delete cascade,
  type text not null, -- text_delta | stage | progress | tool_call | tool_result | error | done
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists hal_agent_run_events_run_id_id_idx
  on public.hal_agent_run_events (run_id, id);

alter table public.hal_agent_run_events disable row level security;


-- Ticket 0082: Agent artifacts system
--
-- Goal:
-- - Store agent completion reports (Implementation, QA, Human-in-the-Loop, and future agent types)
-- - Link artifacts to tickets via ticket_pk
-- - Support multiple artifacts per ticket (one per agent type per completion)
-- - Enable UI to display artifacts in ticket detail view

create extension if not exists pgcrypto;

create table if not exists public.agent_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- Agent type: implementation | qa | human-in-the-loop | other
  agent_type text not null,
  
  -- Report content
  title text not null,
  body_md text not null default '',
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint agent_artifacts_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

-- Indexes for efficient queries
create index if not exists agent_artifacts_ticket_idx
  on public.agent_artifacts (ticket_pk, created_at desc);

create index if not exists agent_artifacts_repo_idx
  on public.agent_artifacts (repo_full_name, created_at desc);

create index if not exists agent_artifacts_type_idx
  on public.agent_artifacts (ticket_pk, agent_type, created_at desc);

-- Auto-update updated_at timestamp
create or replace function public.agent_artifacts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_artifacts_touch on public.agent_artifacts;
create trigger agent_artifacts_touch
before update on public.agent_artifacts
for each row execute function public.agent_artifacts_touch_updated_at();

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.agent_artifacts enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
create policy "Allow all operations on agent_artifacts"
  on public.agent_artifacts
  for all
  using (true)
  with check (true);

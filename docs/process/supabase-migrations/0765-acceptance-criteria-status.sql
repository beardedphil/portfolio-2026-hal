-- Ticket 0765: Acceptance Criteria Status System
--
-- Goal:
-- - Store acceptance criteria status for each ticket
-- - Track status (met/unmet), actor type (human/agent), justification, and timestamps
-- - Enable drift gate logic to block transitions when ACs are unmet
-- - Support UI to display and update AC status

create table if not exists public.acceptance_criteria_status (
  ac_status_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- AC item identifier (index within the ticket's AC list, 0-based)
  ac_index integer not null,
  
  -- AC item text (snapshot at time of creation, for reference)
  ac_text text not null,
  
  -- Status: 'met' or 'unmet'
  status text not null default 'unmet' check (status in ('met', 'unmet')),
  
  -- Actor type: 'human' or 'agent'
  actor_type text not null default 'human' check (actor_type in ('human', 'agent')),
  
  -- Optional agent type/name (if actor_type is 'agent')
  agent_type text,
  
  -- Justification note
  justification text default '',
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint acceptance_criteria_status_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade,
  
  -- Unique constraint: one status per AC item per ticket
  constraint acceptance_criteria_status_unique unique (ticket_pk, ac_index)
);

-- Indexes for efficient queries
create index if not exists acceptance_criteria_status_ticket_idx
  on public.acceptance_criteria_status (ticket_pk, ac_index);

create index if not exists acceptance_criteria_status_repo_idx
  on public.acceptance_criteria_status (repo_full_name, ticket_pk);

-- Index for drift gate queries (find tickets with unmet ACs)
create index if not exists acceptance_criteria_status_unmet_idx
  on public.acceptance_criteria_status (ticket_pk, status)
  where status = 'unmet';

-- Auto-update updated_at timestamp
create or replace function public.acceptance_criteria_status_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists acceptance_criteria_status_touch on public.acceptance_criteria_status;
create trigger acceptance_criteria_status_touch
before update on public.acceptance_criteria_status
for each row execute function public.acceptance_criteria_status_touch_updated_at();

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.acceptance_criteria_status enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on acceptance_criteria_status" on public.acceptance_criteria_status;
create policy "Allow all operations on acceptance_criteria_status"
  on public.acceptance_criteria_status
  for all
  using (true)
  with check (true);

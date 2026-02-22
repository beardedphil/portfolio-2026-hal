-- Ticket 0767: Drift Gate CI Status
--
-- Goal:
-- - Store CI evaluation results for drift-gated transitions
-- - Track evaluated head SHA, overall status, and required-checks breakdown
-- - Enable drift gate to block transitions when required CI checks are failing

create table if not exists public.drift_attempts (
  drift_attempt_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- PR information
  pr_url text,
  
  -- CI evaluation details
  evaluated_head_sha text not null,
  overall_status text not null check (overall_status in ('passing', 'failing', 'pending', 'running', 'unknown')),
  
  -- Required checks breakdown (JSONB for flexibility)
  required_checks jsonb not null default '{}'::jsonb,
  -- Structure: { "unit": { "status": "passing", "name": "unit" }, "e2e": { "status": "failing", "name": "e2e" } }
  
  -- Failing checks (array of check names)
  failing_checks jsonb not null default '[]'::jsonb,
  -- Structure: ["unit", "e2e"] (array of check names that are failing)
  
  -- Link to PR checks page
  checks_url text,
  
  -- Metadata
  created_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint drift_attempts_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

-- Indexes for efficient queries
create index if not exists drift_attempts_ticket_idx
  on public.drift_attempts (ticket_pk, created_at desc);

create index if not exists drift_attempts_repo_idx
  on public.drift_attempts (repo_full_name, ticket_pk);

-- Index for finding latest attempt per ticket
create index if not exists drift_attempts_latest_idx
  on public.drift_attempts (ticket_pk, created_at desc);

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.drift_attempts enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on drift_attempts" on public.drift_attempts;
create policy "Allow all operations on drift_attempts"
  on public.drift_attempts
  for all
  using (true)
  with check (true);

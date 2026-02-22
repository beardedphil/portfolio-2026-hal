-- Ticket HAL-0768: Drift Gate Docs Consistency Check
-- 
-- Creates a table to store drift gate attempt records, including docs consistency check results.

create table if not exists public.drift_gate_attempts (
  pk uuid primary key default gen_random_uuid(),
  ticket_pk uuid not null,
  repo_full_name text not null,
  column_id text not null,
  docs_check_passed boolean not null,
  docs_check_findings jsonb not null default '[]'::jsonb,
  attempted_at timestamptz not null default now(),
  
  constraint drift_gate_attempts_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

create index if not exists drift_gate_attempts_ticket_idx
  on public.drift_gate_attempts (ticket_pk, attempted_at desc);

create index if not exists drift_gate_attempts_repo_idx
  on public.drift_gate_attempts (repo_full_name, attempted_at desc);

-- Enable RLS
alter table public.drift_gate_attempts enable row level security;

-- Allow all operations (server-side only, uses service role key)
drop policy if exists "Allow all operations on drift_gate_attempts" on public.drift_gate_attempts;
create policy "Allow all operations on drift_gate_attempts"
  on public.drift_gate_attempts
  for all
  using (true)
  with check (true);

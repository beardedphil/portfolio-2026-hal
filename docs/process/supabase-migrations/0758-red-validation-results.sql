-- Ticket 0758: RED validation results storage
--
-- Goal:
-- - Store RED validation results for tickets
-- - Link validation results to tickets via ticket_pk
-- - Store validation status, failures, and timestamp
-- - Enable UI to display validation status and history

create table if not exists public.red_validation_results (
  validation_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- RED document version (e.g., "v0")
  red_version text not null default 'v0',
  
  -- Validation result
  pass boolean not null,
  failures jsonb not null default '[]'::jsonb,
  
  -- RED document snapshot (for audit/debugging)
  red_document jsonb,
  
  -- Metadata
  validated_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint red_validation_results_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

-- Indexes for efficient queries
create index if not exists red_validation_results_ticket_idx
  on public.red_validation_results (ticket_pk, validated_at desc);

create index if not exists red_validation_results_repo_idx
  on public.red_validation_results (repo_full_name, validated_at desc);

-- Index for latest validation per ticket
create index if not exists red_validation_results_latest_idx
  on public.red_validation_results (ticket_pk, red_version, validated_at desc);

-- Enable row-level security
alter table public.red_validation_results enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on red_validation_results" on public.red_validation_results;
create policy "Allow all operations on red_validation_results"
  on public.red_validation_results
  for all
  using (true)
  with check (true);

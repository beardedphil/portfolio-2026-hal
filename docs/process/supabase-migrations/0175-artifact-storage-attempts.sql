-- Ticket 0175: Artifact storage attempts tracking
--
-- Goal:
-- - Track all artifact storage attempts (successful and failed) for diagnostics
-- - Enable UI to show why artifacts are missing (storage vs retrieval vs validation reject)
-- - Store endpoint, outcome, validation errors, and timestamps

create extension if not exists pgcrypto;

create table if not exists public.artifact_storage_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  
  -- Link to ticket
  ticket_pk uuid not null,
  repo_full_name text not null,
  
  -- Artifact type being stored
  artifact_type text not null, -- e.g., 'plan', 'worklog', 'changed-files', etc.
  agent_type text not null, -- e.g., 'implementation', 'qa'
  
  -- Storage attempt details
  endpoint text not null, -- e.g., '/api/artifacts/insert-implementation', '/api/artifacts/insert-qa'
  outcome text not null, -- 'stored', 'rejected by validation', 'request failed'
  error_message text, -- Error message if outcome is not 'stored'
  validation_reason text, -- Specific validation reason if rejected by validation
  
  -- Metadata
  attempted_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint artifact_storage_attempts_ticket_fk foreign key (ticket_pk) references public.tickets (pk) on delete cascade
);

-- Indexes for efficient queries
create index if not exists artifact_storage_attempts_ticket_idx
  on public.artifact_storage_attempts (ticket_pk, artifact_type, attempted_at desc);

create index if not exists artifact_storage_attempts_repo_idx
  on public.artifact_storage_attempts (repo_full_name, attempted_at desc);

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.artifact_storage_attempts enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on artifact_storage_attempts" on public.artifact_storage_attempts;
create policy "Allow all operations on artifact_storage_attempts"
  on public.artifact_storage_attempts
  for all
  using (true)
  with check (true);

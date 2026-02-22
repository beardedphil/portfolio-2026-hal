-- Ticket HAL-0784: Create failures table for failure library
-- 
-- Stores normalized failure records with root cause, prevention candidates, and recurrence tracking.
-- Failures are identified by a stable fingerprint/key to group recurrences.

create table if not exists public.failures (
  id uuid primary key default gen_random_uuid(),
  
  -- Failure identification
  failure_type text not null, -- e.g., 'drift', 'agent_outcome', 'qa', 'hitl'
  fingerprint text not null, -- Stable key to identify recurrences (e.g., hash of failure characteristics)
  
  -- Failure details
  root_cause text null, -- Human-readable root cause description
  prevention_candidate text null, -- Suggested prevention strategy
  
  -- Recurrence tracking
  recurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  
  -- Optional references (JSONB for flexibility)
  "references" jsonb null default '{}'::jsonb, -- { ticket_pk?: string, drift_attempt_id?: string, agent_run_id?: string, etc. }
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create unique index on fingerprint to prevent duplicates and enable upsert
create unique index if not exists failures_fingerprint_idx on public.failures (fingerprint);

-- Create index for querying by failure type
create index if not exists failures_type_idx on public.failures (failure_type, last_seen_at desc);

-- Create index for querying by first_seen_at and last_seen_at
create index if not exists failures_timestamps_idx on public.failures (first_seen_at desc, last_seen_at desc);

-- Add comments for documentation
comment on table public.failures is 'Normalized failure library for tracking failures with root cause, prevention candidates, and recurrence tracking';
comment on column public.failures.failure_type is 'Type of failure: drift, agent_outcome, qa, hitl, etc.';
comment on column public.failures.fingerprint is 'Stable key to identify recurrences (e.g., hash of failure characteristics). Used to group multiple occurrences of the same failure.';
comment on column public.failures.root_cause is 'Human-readable root cause description';
comment on column public.failures.prevention_candidate is 'Suggested prevention strategy or improvement';
comment on column public.failures.recurrence_count is 'Number of times this failure has occurred (incremented on recurrence)';
comment on column public.failures."references" is 'References object: { ticket_pk?: string, drift_attempt_id?: string, agent_run_id?: string, etc. }';

-- Disable RLS (server-side only access via service role)
alter table public.failures disable row level security;

-- Ticket HAL-0784: Create failures table for failure library
-- 
-- Creates a normalized failure library that records failures with:
-- - failure_type: Type of failure (e.g., "DRIFT_ATTEMPT", "AGENT_OUTCOME")
-- - root_cause: Human-readable root cause description
-- - prevention_candidate: Suggested prevention strategy
-- - recurrence_count: Number of times this failure has occurred
-- - first_seen_at: When this failure was first recorded
-- - last_seen_at: When this failure was most recently seen
-- - fingerprint: Stable key used to identify recurrences (computed from failure characteristics)

create table if not exists public.failures (
  id uuid primary key default gen_random_uuid(),
  
  -- Failure identification
  failure_type text not null,
  fingerprint text not null, -- Stable key for recurrence detection
  
  -- Failure details
  root_cause text null,
  prevention_candidate text null,
  
  -- Recurrence tracking
  recurrence_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create unique index on fingerprint to enable upsert behavior
create unique index if not exists failures_fingerprint_idx
  on public.failures (fingerprint);

-- Create index for querying by failure type
create index if not exists failures_failure_type_idx
  on public.failures (failure_type, last_seen_at desc);

-- Create index for querying by last seen (most recent first)
create index if not exists failures_last_seen_at_idx
  on public.failures (last_seen_at desc);

-- Create trigger to update updated_at timestamp
create or replace function public.failures_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists failures_touch on public.failures;
create trigger failures_touch
before update on public.failures
for each row execute function public.failures_touch_updated_at();

-- Add comments for documentation
comment on table public.failures is 'Normalized failure library that records failures with root cause, prevention candidates, and recurrence tracking';
comment on column public.failures.failure_type is 'Type of failure (e.g., "DRIFT_ATTEMPT", "AGENT_OUTCOME")';
comment on column public.failures.fingerprint is 'Stable key computed from failure characteristics to identify recurrences';
comment on column public.failures.root_cause is 'Human-readable root cause description';
comment on column public.failures.prevention_candidate is 'Suggested prevention strategy';
comment on column public.failures.recurrence_count is 'Number of times this failure has occurred';
comment on column public.failures.first_seen_at is 'When this failure was first recorded';
comment on column public.failures.last_seen_at is 'When this failure was most recently seen';

-- Disable RLS (row-level security) for now - may be enabled later if needed
alter table public.failures disable row level security;

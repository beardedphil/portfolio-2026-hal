-- Failure Library (HAL-0784)
-- Goal:
-- - Store normalized failure records with root cause, prevention candidates, and recurrence tracking
-- - Support failures from drift attempts and agent outcomes
-- - Group recurrences by fingerprint/key

create table if not exists public.failures (
  id uuid primary key default gen_random_uuid(),
  
  -- Failure identification
  failure_type text not null, -- e.g., 'DRIFT_FAILURE', 'AGENT_OUTCOME_FAILURE', 'UNMET_AC', etc.
  fingerprint text not null, -- Stable key used to identify recurrences (e.g., hash of normalized failure signature)
  
  -- Failure details
  root_cause text null, -- Human-readable root cause description
  prevention_candidate text null, -- Suggested prevention strategy or fix
  
  -- Recurrence tracking
  recurrence_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  
  -- Metadata
  source_type text not null, -- 'drift_attempt' | 'agent_outcome'
  source_id uuid null, -- Reference to drift_attempts.id or hal_agent_runs.run_id (depending on source_type)
  ticket_pk uuid null references public.tickets(pk) on delete set null,
  
  -- Additional context (JSONB for flexibility)
  metadata jsonb null default '{}'::jsonb, -- Additional context like transition name, agent type, etc.
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on fingerprint to prevent duplicates
create unique index if not exists failures_fingerprint_idx
  on public.failures (fingerprint);

-- Index for querying by failure type
create index if not exists failures_type_idx
  on public.failures (failure_type, last_seen_at desc);

-- Index for querying by ticket
create index if not exists failures_ticket_pk_idx
  on public.failures (ticket_pk) where ticket_pk is not null;

-- Index for querying by source
create index if not exists failures_source_idx
  on public.failures (source_type, source_id) where source_id is not null;

-- Index for recurrence queries (most frequent failures)
create index if not exists failures_recurrence_idx
  on public.failures (recurrence_count desc, last_seen_at desc);

-- Trigger to update updated_at timestamp
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

-- Disable RLS (server-side access only)
alter table public.failures disable row level security;

-- Comments for documentation
comment on table public.failures is 'Normalized failure library tracking root causes, prevention candidates, and recurrence counts';
comment on column public.failures.failure_type is 'Type of failure (e.g., DRIFT_FAILURE, AGENT_OUTCOME_FAILURE, UNMET_AC)';
comment on column public.failures.fingerprint is 'Stable key used to identify recurrences (hash of normalized failure signature)';
comment on column public.failures.root_cause is 'Human-readable root cause description';
comment on column public.failures.prevention_candidate is 'Suggested prevention strategy or fix';
comment on column public.failures.recurrence_count is 'Number of times this failure has occurred';
comment on column public.failures.source_type is 'Source of the failure: drift_attempt or agent_outcome';
comment on column public.failures.source_id is 'Reference to drift_attempts.id or hal_agent_runs.run_id';
comment on column public.failures.metadata is 'Additional context (transition name, agent type, etc.)';

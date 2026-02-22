-- HAL-0766: Add fields to drift_attempts table for transition tracking and normalized reasons
-- Adds: transition, pr_number, head_sha, reason_types, reason_messages, references

-- Add transition column (required)
alter table public.drift_attempts
  add column if not exists transition text;

-- Add pr_number column (optional, extracted from PR URL)
alter table public.drift_attempts
  add column if not exists pr_number integer;

-- Add head_sha column (optional, head SHA from PR)
alter table public.drift_attempts
  add column if not exists head_sha text;

-- Add normalized reason fields (HAL-0766)
alter table public.drift_attempts
  add column if not exists reason_types text[];

alter table public.drift_attempts
  add column if not exists reason_messages text[];

-- Add references JSONB field (for PR URL, checksums, manifest/red references)
alter table public.drift_attempts
  add column if not exists references jsonb;

-- Create index for transition queries
create index if not exists drift_attempts_transition_idx
  on public.drift_attempts (ticket_pk, transition, attempted_at desc);

-- Create index for pr_number queries
create index if not exists drift_attempts_pr_number_idx
  on public.drift_attempts (pr_number) where pr_number is not null;

-- Update existing rows to have a default transition value if null
-- Use 'unknown' for historical records where transition wasn't tracked
update public.drift_attempts
  set transition = 'unknown'
  where transition is null;

-- Make transition NOT NULL after backfilling
alter table public.drift_attempts
  alter column transition set not null;

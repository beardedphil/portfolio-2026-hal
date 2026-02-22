-- Ticket 0785: Policy Adjustment System
--
-- Goal:
-- - Enable maintainers to safely trial, measure, and promote or revert changes to HAL "process/rule" behavior
-- - Track policy status (Off, Trial, Promoted)
-- - Record metrics (baseline vs trial event counts)
-- - Maintain audit log of policy changes

create extension if not exists pgcrypto;

-- Policies table: defines available policies
create table if not exists public.policies (
  policy_id text primary key, -- e.g., 'strict-ac-validation', 'auto-move-on-complete'
  name text not null, -- Human-readable name
  description text not null, -- Human-readable description of what the policy changes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Policy status table: tracks current status of each policy
create table if not exists public.policy_status (
  policy_id text primary key,
  status text not null check (status in ('off', 'trial', 'promoted')), -- Current status
  last_changed_at timestamptz not null default now(),
  last_changed_by text, -- 'system' or user identifier
  constraint policy_status_policy_fk foreign key (policy_id) references public.policies (policy_id) on delete cascade
);

-- Policy metrics table: tracks event counts for baseline and trial windows
create table if not exists public.policy_metrics (
  metric_id uuid primary key default gen_random_uuid(),
  policy_id text not null,
  window_type text not null check (window_type in ('baseline', 'trial')), -- Which window this metric is for
  event_count integer not null default 0,
  window_start timestamptz not null,
  window_end timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint policy_metrics_policy_fk foreign key (policy_id) references public.policies (policy_id) on delete cascade
);

-- Policy audit log: tracks all status changes
create table if not exists public.policy_audit_log (
  audit_id uuid primary key default gen_random_uuid(),
  policy_id text not null,
  action text not null, -- 'start_trial', 'promote', 'revert'
  from_status text, -- Previous status (null for first action)
  to_status text not null, -- New status
  actor text not null, -- 'system' or user identifier
  timestamp timestamptz not null default now(),
  constraint policy_audit_log_policy_fk foreign key (policy_id) references public.policies (policy_id) on delete cascade
);

-- Indexes for efficient queries
create index if not exists policy_metrics_policy_window_idx
  on public.policy_metrics (policy_id, window_type, window_start desc);

create index if not exists policy_audit_log_policy_timestamp_idx
  on public.policy_audit_log (policy_id, timestamp desc);

-- Enable row-level security
alter table public.policies enable row level security;
alter table public.policy_status enable row level security;
alter table public.policy_metrics enable row level security;
alter table public.policy_audit_log enable row level security;

-- Policies: allow all operations
drop policy if exists "Allow all operations on policies" on public.policies;
create policy "Allow all operations on policies"
  on public.policies
  for all
  using (true)
  with check (true);

-- Policy status: allow all operations
drop policy if exists "Allow all operations on policy_status" on public.policy_status;
create policy "Allow all operations on policy_status"
  on public.policy_status
  for all
  using (true)
  with check (true);

-- Policy metrics: allow all operations
drop policy if exists "Allow all operations on policy_metrics" on public.policy_metrics;
create policy "Allow all operations on policy_metrics"
  on public.policy_metrics
  for all
  using (true)
  with check (true);

-- Policy audit log: allow all operations
drop policy if exists "Allow all operations on policy_audit_log" on public.policy_audit_log;
create policy "Allow all operations on policy_audit_log"
  on public.policy_audit_log
  for all
  using (true)
  with check (true);

-- Insert some example policies (can be extended later)
insert into public.policies (policy_id, name, description) values
  ('strict-ac-validation', 'Strict AC Validation', 'Requires all acceptance criteria to be explicitly marked as met before moving tickets forward.'),
  ('auto-move-on-complete', 'Auto-move on Complete', 'Automatically moves tickets to Ready for QA when implementation is complete.'),
  ('mandatory-key-decisions', 'Mandatory Key Decisions', 'Requires implementation agents to document key decisions in PM Review artifacts.')
on conflict (policy_id) do nothing;

-- Initialize policy statuses as 'off' for all policies
insert into public.policy_status (policy_id, status, last_changed_by)
  select policy_id, 'off', 'system'
  from public.policies
  where policy_id not in (select policy_id from public.policy_status)
on conflict (policy_id) do nothing;

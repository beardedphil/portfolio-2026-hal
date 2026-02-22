-- Policy Adjustment System (HAL-0785)
-- Goal: Enable maintainers to safely trial, measure, and promote/revert changes to HAL "process/rule" behavior
--
-- Tables:
-- - policies: Policy definitions
-- - policy_metrics: Metrics tracking (baseline vs trial counts)
-- - policy_audit_log: Audit log of policy status changes

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  
  -- Policy identification
  policy_key text not null unique, -- Unique identifier for the policy (e.g., 'ac-confirmation-checklist', 'state-management-docs')
  name text not null, -- Human-readable name
  description text not null, -- Human-readable description of what the policy changes
  
  -- Current status: 'off', 'trial', 'promoted'
  status text not null default 'off' check (status in ('off', 'trial', 'promoted')),
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now() -- When status last changed
  
);

-- Index for querying by status
create index if not exists policies_status_idx
  on public.policies (status);

-- Index for querying by policy_key
create unique index if not exists policies_key_idx
  on public.policies (policy_key);

-- Trigger to update updated_at and last_changed_at timestamps
create or replace function public.policies_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- Only update last_changed_at if status actually changed
  if old.status is distinct from new.status then
    new.last_changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists policies_touch on public.policies;
create trigger policies_touch
before update on public.policies
for each row execute function public.policies_touch_updated_at();

-- Policy metrics table: tracks baseline vs trial event counts
create table if not exists public.policy_metrics (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  -- Time windows
  baseline_window_start timestamptz not null, -- Start of baseline measurement window
  baseline_window_end timestamptz not null, -- End of baseline measurement window
  trial_window_start timestamptz not null, -- Start of trial measurement window
  trial_window_end timestamptz not null, -- End of trial measurement window (or now() if ongoing)
  
  -- Event counts
  events_in_baseline_window bigint not null default 0,
  events_in_trial_window bigint not null default 0,
  
  -- Metadata
  event_type text, -- Optional: type of event being measured (e.g., 'ticket_move', 'artifact_created')
  metadata jsonb default '{}'::jsonb, -- Additional context
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for querying metrics by policy
create index if not exists policy_metrics_policy_id_idx
  on public.policy_metrics (policy_id, created_at desc);

-- Trigger to update updated_at timestamp
create or replace function public.policy_metrics_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists policy_metrics_touch on public.policy_metrics;
create trigger policy_metrics_touch
before update on public.policy_metrics
for each row execute function public.policy_metrics_touch_updated_at();

-- Policy audit log: tracks all status changes (trial/promote/revert)
create table if not exists public.policy_audit_log (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  -- Action details
  action text not null, -- 'start_trial', 'promote', 'revert'
  target_status text not null, -- The status after the action ('trial', 'promoted', 'off')
  previous_status text, -- The status before the action
  
  -- Actor information
  actor text not null, -- 'system' | 'user:<identifier>' (e.g., 'user:github_login')
  actor_type text not null default 'system', -- 'system' | 'user'
  
  -- Timestamp
  created_at timestamptz not null default now(),
  
  -- Optional metadata
  metadata jsonb default '{}'::jsonb -- Additional context
);

-- Index for querying audit log by policy
create index if not exists policy_audit_log_policy_id_idx
  on public.policy_audit_log (policy_id, created_at desc);

-- Index for querying by actor
create index if not exists policy_audit_log_actor_idx
  on public.policy_audit_log (actor, created_at desc);

-- Disable RLS (server-side access only)
alter table public.policies disable row level security;
alter table public.policy_metrics disable row level security;
alter table public.policy_audit_log disable row level security;

-- Comments for documentation
comment on table public.policies is 'Policy definitions for HAL process/rule behavior adjustments';
comment on column public.policies.policy_key is 'Unique identifier for the policy (e.g., ac-confirmation-checklist)';
comment on column public.policies.status is 'Current status: off, trial, or promoted';
comment on column public.policies.last_changed_at is 'Timestamp when status last changed';

comment on table public.policy_metrics is 'Metrics tracking baseline vs trial event counts for policies';
comment on column public.policy_metrics.events_in_baseline_window is 'Number of events in the baseline measurement window';
comment on column public.policy_metrics.events_in_trial_window is 'Number of events in the trial measurement window';

comment on table public.policy_audit_log is 'Audit log of all policy status changes (trial/promote/revert)';
comment on column public.policy_audit_log.action is 'Action taken: start_trial, promote, or revert';
comment on column public.policy_audit_log.actor is 'Actor who performed the action: system or user:<identifier>';

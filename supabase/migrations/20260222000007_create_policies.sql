-- Policy Adjustment System (HAL-0785)
-- Goal:
-- - Store policy definitions and their status (Off, Trial, Promoted)
-- - Track metrics for baseline vs trial windows
-- - Maintain audit log of policy status changes

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  
  -- Policy identification
  policy_key text not null unique, -- Unique identifier for the policy (e.g., 'require-ac-confirmation', 'mandatory-build-check')
  name text not null, -- Human-readable name
  description text not null, -- Human-readable description of what the policy changes
  
  -- Status tracking
  status text not null default 'off' check (status in ('off', 'trial', 'promoted')), -- Current status: off, trial, or promoted
  last_changed_at timestamptz not null default now(), -- When status was last changed
  last_changed_by text not null default 'system', -- Who changed it (user ID or 'system')
  
  -- Trial window tracking
  trial_started_at timestamptz null, -- When trial was started (null if not in trial)
  baseline_window_start timestamptz null, -- Start of baseline window (before trial)
  baseline_window_end timestamptz null, -- End of baseline window (when trial started)
  
  -- Metadata
  metadata jsonb null default '{}'::jsonb, -- Additional policy-specific configuration
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Policy metrics table (tracks events in baseline vs trial windows)
create table if not exists public.policy_metrics (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  -- Window identification
  window_type text not null check (window_type in ('baseline', 'trial')), -- Which window this metric belongs to
  window_start timestamptz not null, -- Start of the measurement window
  window_end timestamptz not null, -- End of the measurement window (or now() if ongoing)
  
  -- Event counts
  event_count int not null default 0, -- Number of events recorded in this window
  
  -- Additional metrics (JSONB for flexibility)
  metrics jsonb null default '{}'::jsonb, -- Additional metrics like success_rate, error_count, etc.
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure one metric record per policy per window type
  unique (policy_id, window_type, window_start)
);

-- Policy audit log (tracks all status changes)
create table if not exists public.policy_audit_log (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  -- Change details
  action text not null check (action in ('start_trial', 'promote', 'revert')), -- What action was taken
  from_status text not null check (from_status in ('off', 'trial', 'promoted')), -- Previous status
  to_status text not null check (to_status in ('off', 'trial', 'promoted')), -- New status
  
  -- Actor information
  actor text not null default 'system', -- Who performed the action (user ID or 'system')
  actor_type text not null default 'system' check (actor_type in ('system', 'user')), -- Type of actor
  
  -- Timestamp
  changed_at timestamptz not null default now(),
  
  -- Additional context
  metadata jsonb null default '{}'::jsonb -- Additional context about the change
);

-- Indexes for policies
create index if not exists policies_key_idx on public.policies (policy_key);
create index if not exists policies_status_idx on public.policies (status);
create index if not exists policies_last_changed_idx on public.policies (last_changed_at desc);

-- Indexes for policy_metrics
create index if not exists policy_metrics_policy_id_idx on public.policy_metrics (policy_id);
create index if not exists policy_metrics_window_type_idx on public.policy_metrics (policy_id, window_type, window_start desc);

-- Indexes for policy_audit_log
create index if not exists policy_audit_log_policy_id_idx on public.policy_audit_log (policy_id);
create index if not exists policy_audit_log_changed_at_idx on public.policy_audit_log (policy_id, changed_at desc);

-- Trigger to update updated_at timestamp for policies
create or replace function public.policies_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists policies_touch on public.policies;
create trigger policies_touch
before update on public.policies
for each row execute function public.policies_touch_updated_at();

-- Trigger to update updated_at timestamp for policy_metrics
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

-- Disable RLS (server-side access only)
alter table public.policies disable row level security;
alter table public.policy_metrics disable row level security;
alter table public.policy_audit_log disable row level security;

-- Comments for documentation
comment on table public.policies is 'Policy definitions and status tracking for HAL process/rule behavior adjustments';
comment on column public.policies.policy_key is 'Unique identifier for the policy (e.g., require-ac-confirmation)';
comment on column public.policies.status is 'Current status: off (disabled), trial (testing), or promoted (permanent)';
comment on column public.policies.last_changed_at is 'When the policy status was last changed';
comment on column public.policies.last_changed_by is 'Who changed the status (user ID or system)';
comment on column public.policies.trial_started_at is 'When the trial was started (null if not in trial)';
comment on column public.policies.baseline_window_start is 'Start of baseline measurement window (before trial)';
comment on column public.policies.baseline_window_end is 'End of baseline window (when trial started)';

comment on table public.policy_metrics is 'Metrics tracking for baseline vs trial windows';
comment on column public.policy_metrics.window_type is 'Type of window: baseline (before trial) or trial (during trial)';
comment on column public.policy_metrics.event_count is 'Number of events recorded in this window';

comment on table public.policy_audit_log is 'Audit log of all policy status changes';
comment on column public.policy_audit_log.action is 'Action taken: start_trial, promote, or revert';
comment on column public.policy_audit_log.actor is 'Who performed the action (user ID or system)';
comment on column public.policy_audit_log.actor_type is 'Type of actor: system or user';

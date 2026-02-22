-- Migration: Create policies system (HAL-0785)
-- Stores policy definitions, status, metrics, and audit logs
-- Goal: Enable safe trial, measurement, and promotion/reversion of HAL process/rule behavior changes

create extension if not exists pgcrypto;

-- Policies table: stores policy definitions and current status
create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null unique, -- Unique identifier for the policy (e.g., 'ac_confirmation_checklist')
  name text not null, -- Human-readable name (e.g., 'AC Confirmation Checklist')
  description text not null, -- Human-readable description of what the policy changes
  
  status text not null default 'off', -- 'off', 'trial', 'promoted'
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(), -- When status last changed
  
  -- Optional metadata (JSONB)
  metadata jsonb default '{}'::jsonb
);

-- Policy audit logs: tracks all status changes
create table if not exists public.policy_audit_logs (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  action text not null, -- 'start_trial', 'promote', 'revert'
  from_status text not null, -- Previous status
  to_status text not null, -- New status
  
  -- Actor information
  actor text, -- 'system', 'user:github_login', etc.
  
  -- Timestamp
  created_at timestamptz not null default now(),
  
  -- Optional metadata (JSONB)
  metadata jsonb default '{}'::jsonb
);

-- Policy metrics: tracks baseline vs trial event counts
create table if not exists public.policy_metrics (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  
  -- Time windows for baseline and trial
  baseline_window_start timestamptz not null,
  baseline_window_end timestamptz not null,
  trial_window_start timestamptz not null,
  trial_window_end timestamptz not null,
  
  -- Event counts
  baseline_event_count integer not null default 0,
  trial_event_count integer not null default 0,
  
  -- Timestamp
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for policies
create index if not exists idx_policies_policy_key on public.policies(policy_key);
create index if not exists idx_policies_status on public.policies(status);

-- Indexes for policy_audit_logs
create index if not exists idx_policy_audit_logs_policy_id on public.policy_audit_logs(policy_id, created_at desc);
create index if not exists idx_policy_audit_logs_action on public.policy_audit_logs(action, created_at desc);

-- Indexes for policy_metrics
create index if not exists idx_policy_metrics_policy_id on public.policy_metrics(policy_id, updated_at desc);

-- Function to update updated_at timestamp
create or replace function update_policies_updated_at()
returns trigger as $$
begin
  update public.policies set updated_at = now() where id = new.id;
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on policy_metrics
create or replace function update_policy_metrics_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_policy_metrics_updated_at
  before update on public.policy_metrics
  for each row
  execute function update_policy_metrics_updated_at();

-- Enable RLS (Row Level Security)
alter table public.policies enable row level security;
alter table public.policy_audit_logs enable row level security;
alter table public.policy_metrics enable row level security;

-- Policies: Allow all operations (adjust as needed for your security requirements)
create policy "Allow all operations on policies" on public.policies
  for all
  using (true)
  with check (true);

-- Policy audit logs: Allow all operations
create policy "Allow all operations on policy_audit_logs" on public.policy_audit_logs
  for all
  using (true)
  with check (true);

-- Policy metrics: Allow all operations
create policy "Allow all operations on policy_metrics" on public.policy_metrics
  for all
  using (true)
  with check (true);

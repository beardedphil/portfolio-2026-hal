-- Migration: Create audit_logs table (HAL-0787)
-- Stores audit log entries for bootstrap/infra actions including provider disconnect/revoke events
-- Goal: Enable per-project audit logging for security and compliance

create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier (e.g., repo_full_name)
  
  action_type text not null, -- e.g., 'provider_disconnect', 'provider_revoke', 'bootstrap_start', 'bootstrap_step', etc.
  status text not null, -- 'succeeded', 'failed', 'pending'
  
  -- Human-readable summary (never contains secrets)
  summary text not null,
  
  -- Optional metadata (JSONB, sanitized to never contain secrets)
  metadata jsonb default '{}'::jsonb,
  
  -- Timestamp
  created_at timestamptz not null default now(),
  
  -- Optional actor identifier (e.g., 'user:github_login', 'system', 'agent:type')
  actor text
);

-- Index for fast lookups by project
create index if not exists idx_audit_logs_project_id on public.audit_logs(project_id, created_at desc);

-- Index for filtering by action type
create index if not exists idx_audit_logs_action_type on public.audit_logs(action_type, created_at desc);

-- Index for filtering by status
create index if not exists idx_audit_logs_status on public.audit_logs(status, created_at desc);

-- Enable RLS (Row Level Security)
alter table public.audit_logs enable row level security;

-- Policy: Allow all operations (adjust as needed for your security requirements)
-- Note: In production, you may want to restrict this based on project ownership
create policy "Allow all operations on audit_logs" on public.audit_logs
  for all
  using (true)
  with check (true);

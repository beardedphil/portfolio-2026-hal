-- Migration: Create provider_connections and project_audit_log tables (0787)
-- Goal: Support provider disconnect functionality and per-project audit logging for bootstrap/infra actions

create extension if not exists pgcrypto;

-- Table: provider_connections
-- Stores which providers are connected to which projects
create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier (e.g., repo name or project name)
  provider_name text not null, -- Provider name (e.g., 'cursor', 'openai', 'github', 'vercel')
  provider_type text not null, -- Type: 'agent' | 'infra' | 'auth'
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz null,
  connection_metadata jsonb null, -- Store provider-specific connection details (encrypted if needed)
  revocation_supported boolean not null default false, -- Whether this provider supports token/access revocation
  revocation_status text null, -- 'pending' | 'succeeded' | 'failed' | null (only set if revocation attempted)
  revocation_error text null, -- Error message if revocation failed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups by project
create index if not exists idx_provider_connections_project_id on public.provider_connections(project_id, disconnected_at nulls first, created_at desc);

-- Index for finding active connections
create index if not exists idx_provider_connections_active on public.provider_connections(project_id, provider_name) where disconnected_at is null;

-- Auto-update updated_at timestamp
create or replace function public.provider_connections_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_connections_touch on public.provider_connections;
create trigger provider_connections_touch
before update on public.provider_connections
for each row execute function public.provider_connections_touch_updated_at();

-- Table: project_audit_log
-- Stores audit log entries for bootstrap/infra actions per project
create table if not exists public.project_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier
  action_type text not null, -- Action type (e.g., 'provider_disconnect', 'provider_revoke', 'bootstrap_start', 'bootstrap_step', etc.)
  action_status text not null, -- 'pending' | 'succeeded' | 'failed'
  summary text not null, -- Human-readable summary of the action
  details jsonb null, -- Additional details (redacted - no secrets/tokens)
  provider_name text null, -- Provider name if action is provider-related
  related_entity_id text null, -- Related entity (e.g., provider_connection id, bootstrap_run id)
  created_at timestamptz not null default now()
);

-- Index for fast lookups by project
create index if not exists idx_project_audit_log_project_id on public.project_audit_log(project_id, created_at desc);

-- Index for filtering by action type
create index if not exists idx_project_audit_log_action_type on public.project_audit_log(project_id, action_type, created_at desc);

-- Enable RLS (Row Level Security)
alter table public.provider_connections enable row level security;
alter table public.project_audit_log enable row level security;

-- Policy: Allow all operations (adjust as needed for your security requirements)
create policy "Allow all operations on provider_connections" on public.provider_connections
  for all
  using (true)
  with check (true);

create policy "Allow all operations on project_audit_log" on public.project_audit_log
  for all
  using (true)
  with check (true);

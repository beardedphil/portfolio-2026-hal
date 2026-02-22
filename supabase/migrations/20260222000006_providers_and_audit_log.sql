-- Migration: Create providers and audit_log tables (HAL-0787)
-- Goal: Store provider connections per project and audit log for bootstrap/infra actions

create extension if not exists pgcrypto;

-- Providers table: stores connected providers for each project
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier (matches bootstrap_runs.project_id)
  provider_type text not null, -- 'cursor' | 'openai' | 'github' | etc.
  provider_name text not null, -- Human-readable name (e.g., "Cursor API", "OpenAI")
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz null,
  status text not null default 'connected', -- 'connected' | 'disconnected'
  credentials jsonb null, -- Encrypted/stored credentials (if needed for revocation)
  metadata jsonb null, -- Additional provider-specific metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure one active connection per provider type per project
  constraint providers_project_provider_unique unique (project_id, provider_type, status) 
    where status = 'connected'
);

-- Index for fast lookups by project
create index if not exists idx_providers_project_id on public.providers(project_id, status, created_at desc);

-- Index for finding connected providers
create index if not exists idx_providers_status on public.providers(status) where status = 'connected';

-- Auto-update updated_at timestamp
create or replace function public.providers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists providers_touch on public.providers;
create trigger providers_touch
before update on public.providers
for each row execute function public.providers_touch_updated_at();

-- Audit log table: stores bootstrap/infra actions for each project
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier
  action_type text not null, -- 'provider_connect' | 'provider_disconnect' | 'provider_revoke' | 'bootstrap_start' | 'bootstrap_step' | etc.
  status text not null, -- 'succeeded' | 'failed' | 'pending'
  summary text not null, -- Human-readable summary (e.g., "Disconnected Cursor API provider")
  details jsonb null, -- Additional details (secrets redacted)
  error_message text null, -- Error message if status is 'failed'
  created_at timestamptz not null default now(),
  
  -- Index for fast lookups by project
  constraint audit_log_project_id_fk foreign key (project_id) references public.bootstrap_runs(project_id) on delete cascade
);

-- Index for fast lookups by project and time
create index if not exists idx_audit_log_project_id on public.audit_log(project_id, created_at desc);

-- Index for filtering by action type
create index if not exists idx_audit_log_action_type on public.audit_log(action_type, created_at desc);

-- Enable RLS (Row Level Security)
alter table public.providers enable row level security;
alter table public.audit_log enable row level security;

-- Policy: Allow all operations on providers (adjust as needed for your security requirements)
create policy "Allow all operations on providers" on public.providers
  for all
  using (true)
  with check (true);

-- Policy: Allow all operations on audit_log (adjust as needed for your security requirements)
create policy "Allow all operations on audit_log" on public.audit_log
  for all
  using (true)
  with check (true);

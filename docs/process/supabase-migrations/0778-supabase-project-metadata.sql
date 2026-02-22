-- Migration: Create supabase_projects table (0778)
-- Stores Supabase project metadata and encrypted credentials for connected GitHub repos
-- Goal: Automatically provision Supabase projects and securely store credentials

-- Create supabase_projects table
create table if not exists public.supabase_projects (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Links to bootstrap_runs.project_id or projects.repo_full_name
  repo_full_name text, -- Optional: GitHub repo identifier (owner/repo format)
  
  -- Supabase project identifiers
  supabase_project_ref text not null unique, -- Project reference (e.g., "abcdefghijklmnop")
  supabase_project_id uuid, -- Supabase project UUID (if available from API)
  supabase_api_url text not null, -- Full API URL (e.g., "https://abcdefghijklmnop.supabase.co")
  
  -- Encrypted credentials (never stored in plaintext)
  encrypted_anon_key text not null, -- Encrypted anon/public key
  encrypted_service_role_key text not null, -- Encrypted service role key
  encrypted_database_password text, -- Encrypted database password (if applicable)
  
  -- Status and auditability
  status text not null default 'created', -- created | failed | not_configured
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text, -- Optional: user identifier or system identifier
  
  -- Error tracking (if creation failed)
  error_summary text,
  error_details text
);

-- Index for fast lookups by project_id
create index if not exists idx_supabase_projects_project_id on public.supabase_projects(project_id);

-- Index for lookups by repo_full_name
create index if not exists idx_supabase_projects_repo_full_name on public.supabase_projects(repo_full_name) where repo_full_name is not null;

-- Index for lookups by supabase_project_ref
create index if not exists idx_supabase_projects_ref on public.supabase_projects(supabase_project_ref);

-- Auto-update updated_at timestamp
create or replace function public.supabase_projects_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists supabase_projects_touch on public.supabase_projects;
create trigger supabase_projects_touch
before update on public.supabase_projects
for each row execute function public.supabase_projects_touch_updated_at();

-- Enable RLS (Row Level Security)
alter table public.supabase_projects enable row level security;

-- Policy: Allow all operations (adjust as needed for your security requirements)
-- Note: In production, you may want to restrict access based on user permissions
create policy "Allow all operations on supabase_projects" on public.supabase_projects
  for all
  using (true)
  with check (true);

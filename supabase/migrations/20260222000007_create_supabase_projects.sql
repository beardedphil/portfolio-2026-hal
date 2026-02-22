-- Migration: Create supabase_projects table (0778)
-- Stores Supabase project metadata and encrypted credentials
-- Goal: Securely store Supabase project identifiers and keys for HAL operations

create extension if not exists pgcrypto;

create table if not exists public.supabase_projects (
  id uuid primary key default gen_random_uuid(),
  project_id text not null, -- Project identifier (e.g., repo name or project name)
  
  -- Project metadata from Supabase Management API
  supabase_project_ref text not null, -- Project reference (e.g., "abcdefghijklmnop")
  supabase_project_name text not null, -- Project name
  supabase_api_url text not null, -- API URL (e.g., "https://abcdefghijklmnop.supabase.co")
  
  -- Encrypted credentials (stored encrypted at rest)
  encrypted_anon_key text not null, -- Encrypted anon/public key
  encrypted_service_role_key text not null, -- Encrypted service role key
  encrypted_database_password text, -- Encrypted database password (if applicable)
  
  -- Status tracking
  status text not null default 'created', -- created | failed | not_configured
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure one project per project_id
  constraint supabase_projects_project_id_key unique (project_id)
);

-- Index for fast lookups by project_id
create index if not exists idx_supabase_projects_project_id on public.supabase_projects(project_id);

-- Index for status lookups
create index if not exists idx_supabase_projects_status on public.supabase_projects(status);

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

-- Policy: Allow all operations (service role key bypasses RLS)
create policy "Allow all operations on supabase_projects" on public.supabase_projects
  for all
  using (true)
  with check (true);

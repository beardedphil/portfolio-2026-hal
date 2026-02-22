-- Ticket HAL-0778: Supabase project metadata table for storing provisioned Supabase project info
--
-- Goal:
-- - Store Supabase project metadata (ref, URL, encrypted keys) for connected GitHub repositories
-- - Enable HAL to securely store and retrieve Supabase project credentials
-- - Support bootstrap flow for automatic project provisioning
--
-- Notes:
-- - This table stores metadata about provisioned Supabase projects
-- - Sensitive credentials (anon key, service role key) are stored encrypted
-- - project_ref is the unique Supabase project identifier
-- - repo_full_name links to the connected GitHub repository

-- Create supabase_projects table if it doesn't exist
create table if not exists public.supabase_projects (
  repo_full_name text primary key,
  project_ref text not null,
  project_url text not null,
  -- Encrypted credentials (using HAL_ENCRYPTION_KEY)
  encrypted_anon_key text not null,
  encrypted_service_role_key text not null,
  -- Status tracking
  status text not null default 'created', -- 'created', 'failed', 'not_configured'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for lookups
create index if not exists supabase_projects_repo_full_name_idx on public.supabase_projects (repo_full_name);
create index if not exists supabase_projects_project_ref_idx on public.supabase_projects (project_ref);

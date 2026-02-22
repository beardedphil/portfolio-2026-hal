-- Ticket HAL-0779: Vercel project metadata table for storing provisioned Vercel project info
--
-- Goal:
-- - Store Vercel project metadata (ID, name, preview URL) for connected GitHub repositories
-- - Enable HAL to retrieve Vercel project info and display preview URLs
-- - Support bootstrap flow for automatic Vercel project creation and deployment
--
-- Notes:
-- - This table stores metadata about provisioned Vercel projects
-- - preview_url is the deployment URL that users can access
-- - project_id is the unique Vercel project identifier
-- - repo_full_name links to the connected GitHub repository

-- Create vercel_projects table if it doesn't exist
create table if not exists public.vercel_projects (
  repo_full_name text primary key,
  project_id text not null,
  project_name text not null,
  preview_url text not null,
  -- Status tracking
  status text not null default 'created', -- 'created', 'failed', 'not_configured'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for lookups
create index if not exists vercel_projects_repo_full_name_idx on public.vercel_projects (repo_full_name);
create index if not exists vercel_projects_project_id_idx on public.vercel_projects (project_id);

-- Enable RLS
alter table public.vercel_projects enable row level security;

-- Allow all operations (similar to supabase_projects)
create policy "Allow all operations on vercel_projects" on public.vercel_projects
  for all
  using (true)
  with check (true);

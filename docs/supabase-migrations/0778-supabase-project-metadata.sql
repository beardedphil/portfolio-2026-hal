-- Ticket 0778: Supabase project metadata table for storing project ref, URL, and encrypted credentials
--
-- Goal:
-- - Store Supabase project reference, URL, and encrypted API keys
-- - Enable HAL to securely store and retrieve Supabase project credentials
-- - Support auditability with timestamps and status tracking
--
-- Notes:
-- - project_ref is the unique identifier (e.g., "abcdefghijklmnop")
-- - api_url is the project API URL (e.g., "https://abcdefghijklmnop.supabase.co")
-- - anon_key and service_role_key are encrypted at rest using HAL_ENCRYPTION_KEY
-- - created_at and updated_at track when the project was created/updated
-- - status tracks the project creation status ('created', 'failed', 'not_configured')

-- Create supabase_projects table if it doesn't exist
create table if not exists public.supabase_projects (
  project_ref text primary key,
  project_name text not null,
  api_url text not null,
  organization_id text,
  region text,
  -- Encrypted credentials (format: iv:authTag:encryptedData)
  anon_key_encrypted text,
  service_role_key_encrypted text,
  -- Status tracking
  status text not null default 'not_configured' check (status in ('created', 'failed', 'not_configured')),
  -- Audit fields
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Optional: link to GitHub repo if applicable
  repo_full_name text references public.projects(repo_full_name) on delete set null
);

-- Create indexes for lookups
create index if not exists supabase_projects_repo_full_name_idx on public.supabase_projects (repo_full_name);
create index if not exists supabase_projects_status_idx on public.supabase_projects (status);
create index if not exists supabase_projects_api_url_idx on public.supabase_projects (api_url);

-- Add comment for documentation
comment on table public.supabase_projects is 'Stores Supabase project metadata and encrypted credentials for HAL operations';
comment on column public.supabase_projects.anon_key_encrypted is 'Encrypted anon key (AES-256-GCM) - never displayed in plaintext after initial capture';
comment on column public.supabase_projects.service_role_key_encrypted is 'Encrypted service role key (AES-256-GCM) - never displayed in plaintext after initial capture';
comment on column public.supabase_projects.status is 'Project creation status: created, failed, or not_configured';

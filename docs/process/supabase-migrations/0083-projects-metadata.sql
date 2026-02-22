-- Ticket 0083: Projects metadata table for storing default_branch and initial_commit_sha
--
-- Goal:
-- - Store default_branch and initial_commit_sha for connected GitHub repositories
-- - Enable HAL to track repo initialization state for bootstrap steps
--
-- Notes:
-- - This table stores metadata about connected GitHub repositories
-- - Used by "Ensure repo initialized" feature to track initialization state
-- - repo_full_name is the unique identifier (owner/repo format)

-- Create projects table if it doesn't exist
create table if not exists public.projects (
  repo_full_name text primary key,
  default_branch text not null,
  initial_commit_sha text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for lookups
create index if not exists projects_repo_full_name_idx on public.projects (repo_full_name);

-- Ticket 0177: Integration Manifest v0 generation and versioning
--
-- Goal:
-- - Store deterministic, auto-generated Integration Manifest v0 for each repo
-- - Support versioning with content-based hashing for reuse
-- - Link versions to track changes (previous_version_id)
-- - Store manifest fields: goal, stack, constraints, conventions
-- - Enable HAL to derive project_manifest.goal/stack/constraints/conventions from repo + env + schema version

create extension if not exists pgcrypto;

create table if not exists public.integration_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  
  -- Repo and environment identifiers
  repo_full_name text not null,
  default_branch text not null,
  schema_version text not null default 'v0',
  
  -- Environment identifiers (stored as JSONB for flexibility)
  env_identifiers jsonb not null default '{}'::jsonb,
  
  -- Manifest content (deterministic fields)
  goal text not null default '',
  stack jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  conventions jsonb not null default '[]'::jsonb,
  
  -- Deterministic content hash (SHA-256 of sorted JSON representation)
  content_hash text not null,
  
  -- Versioning: link to previous version
  previous_version_id uuid,
  
  -- Metadata
  created_at timestamptz not null default now(),
  created_by text,
  
  -- Foreign key to previous version
  constraint integration_manifests_previous_fk 
    foreign key (previous_version_id) 
    references public.integration_manifests (manifest_id) 
    on delete set null
);

-- Unique constraint: one version per content hash per repo
-- This ensures deterministic reuse: same inputs → same version
create unique index if not exists integration_manifests_repo_hash_idx
  on public.integration_manifests (repo_full_name, content_hash);

-- Index for efficient queries: latest version per repo
create index if not exists integration_manifests_repo_created_idx
  on public.integration_manifests (repo_full_name, created_at desc);

-- Index for version chain traversal
create index if not exists integration_manifests_previous_idx
  on public.integration_manifests (previous_version_id);

-- Enable row-level security
alter table public.integration_manifests enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on integration_manifests" on public.integration_manifests;
create policy "Allow all operations on integration_manifests"
  on public.integration_manifests
  for all
  using (true)
  with check (true);

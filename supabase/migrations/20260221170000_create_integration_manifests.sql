-- Integration Manifest v0: Deterministic generation and versioning
-- Goal:
-- - Store generated integration manifests with deterministic versioning
-- - Support version chaining via previous_version_id
-- - Use content hash for deduplication and deterministic versioning

create extension if not exists pgcrypto;

create table if not exists public.integration_manifests (
  id uuid primary key default gen_random_uuid(),
  
  -- Input identifiers (deterministic generation inputs)
  repo_full_name text not null,
  default_branch text not null,
  schema_version text not null default 'v0',
  env_identifiers jsonb not null default '{}'::jsonb, -- known environment identifiers
  
  -- Generated manifest content
  manifest_content jsonb not null, -- { goal, stack, constraints, conventions }
  content_hash text not null, -- SHA-256 hash of deterministic manifest JSON
  
  -- Versioning
  previous_version_id uuid null references public.integration_manifests(id) on delete set null,
  version_number int not null, -- sequential version number per repo
  
  -- Metadata
  created_at timestamptz not null default now(),
  created_by text null -- user/agent that triggered generation
);

-- Index for content hash lookups (deterministic version reuse)
create unique index if not exists integration_manifests_content_hash_idx
  on public.integration_manifests (content_hash);

-- Index for repo + branch + schema version lookups
create index if not exists integration_manifests_repo_branch_schema_idx
  on public.integration_manifests (repo_full_name, default_branch, schema_version, created_at desc);

-- Index for version chaining
create index if not exists integration_manifests_previous_version_idx
  on public.integration_manifests (previous_version_id);

-- Index for repo version number lookups
create index if not exists integration_manifests_repo_version_idx
  on public.integration_manifests (repo_full_name, version_number desc);

-- Function to get or create next version number for a repo
create or replace function public.get_next_manifest_version(p_repo_full_name text)
returns int
language plpgsql
as $$
declare
  v_max_version int;
begin
  select coalesce(max(version_number), 0) into v_max_version
  from public.integration_manifests
  where repo_full_name = p_repo_full_name;
  return v_max_version + 1;
end;
$$;

alter table public.integration_manifests disable row level security;

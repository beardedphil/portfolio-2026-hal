-- Ticket 0773: Integration Manifest v0 generation + versioning
--
-- Goal:
-- - Store deterministic, auto-generated Integration Manifest v0
-- - Track manifest versions with content-based versioning
-- - Link versions to enable version history
-- - Support deterministic regeneration (same inputs = same version)

create extension if not exists pgcrypto;

-- Integration manifests table
create table if not exists public.integration_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  
  -- Repository and environment identifiers
  repo_full_name text not null,
  default_branch text not null,
  schema_version text not null default 'v0', -- e.g., 'v0', 'v1', etc.
  
  -- Environment identifiers (stored as JSONB for flexibility)
  env_identifiers jsonb not null default '{}'::jsonb,
  
  -- Generated manifest content (deterministic fields)
  manifest_content jsonb not null, -- Contains: goal, stack, constraints, conventions
  
  -- Versioning
  content_hash text not null, -- SHA-256 hash of deterministic manifest_content
  version_number integer not null, -- Sequential version number for this repo
  previous_version_id uuid, -- Link to previous version (if any)
  
  -- Metadata
  created_at timestamptz not null default now(),
  
  -- Unique constraint: one version per content hash per repo
  constraint integration_manifests_repo_hash_unique unique (repo_full_name, content_hash)
);

-- Indexes for efficient queries
create index if not exists integration_manifests_repo_idx
  on public.integration_manifests (repo_full_name, version_number desc);

create index if not exists integration_manifests_hash_idx
  on public.integration_manifests (content_hash);

create index if not exists integration_manifests_previous_version_idx
  on public.integration_manifests (previous_version_id);

-- Foreign key to previous version
alter table public.integration_manifests
  add constraint integration_manifests_previous_version_fk
  foreign key (previous_version_id) references public.integration_manifests (manifest_id)
  on delete set null;

-- Enable row-level security
alter table public.integration_manifests enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on integration_manifests" on public.integration_manifests;
create policy "Allow all operations on integration_manifests"
  on public.integration_manifests
  for all
  using (true)
  with check (true);

-- Function to get or create manifest version
-- Returns existing manifest if content_hash matches, otherwise creates new version
create or replace function public.get_or_create_manifest_version(
  p_repo_full_name text,
  p_default_branch text,
  p_schema_version text,
  p_env_identifiers jsonb,
  p_manifest_content jsonb,
  p_content_hash text
) returns uuid as $$
declare
  v_existing_id uuid;
  v_next_version integer;
  v_previous_id uuid;
begin
  -- Check if manifest with same content hash already exists for this repo
  select manifest_id into v_existing_id
  from public.integration_manifests
  where repo_full_name = p_repo_full_name
    and content_hash = p_content_hash
  limit 1;
  
  -- If exists, return existing manifest_id
  if v_existing_id is not null then
    return v_existing_id;
  end if;
  
  -- Get next version number for this repo
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.integration_manifests
  where repo_full_name = p_repo_full_name;
  
  -- Get the latest version as previous_version_id
  select manifest_id into v_previous_id
  from public.integration_manifests
  where repo_full_name = p_repo_full_name
  order by version_number desc
  limit 1;
  
  -- Insert new manifest version
  insert into public.integration_manifests (
    repo_full_name,
    default_branch,
    schema_version,
    env_identifiers,
    manifest_content,
    content_hash,
    version_number,
    previous_version_id
  ) values (
    p_repo_full_name,
    p_default_branch,
    p_schema_version,
    p_env_identifiers,
    p_manifest_content,
    p_content_hash,
    v_next_version,
    v_previous_id
  ) returning manifest_id into v_existing_id;
  
  return v_existing_id;
end;
$$ language plpgsql;

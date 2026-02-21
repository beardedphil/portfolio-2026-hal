-- Ticket 0773: Integration Manifest v0 generation and versioning
--
-- Goal:
-- - Store deterministic, auto-generated Integration Manifests
-- - Support versioning with content-based checksums
-- - Link versions to track changes over time
-- - Enable reuse of identical manifests (same checksum = same version)

create extension if not exists pgcrypto;

create table if not exists public.integration_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  
  -- Repository and branch identifiers
  repo_full_name text not null,
  default_branch text not null,
  
  -- Schema version for future compatibility
  schema_version text not null default 'v0',
  
  -- Manifest content fields
  goal text not null,
  stack jsonb not null default '[]'::jsonb, -- Array of stack items
  constraints jsonb not null default '[]'::jsonb, -- Array of constraints
  conventions jsonb not null default '[]'::jsonb, -- Array of conventions
  
  -- Deterministic content hash for version reuse
  content_checksum text not null,
  
  -- Version linking
  previous_version_id uuid, -- Links to previous version if this is a new version
  
  -- Metadata
  created_at timestamptz not null default now(),
  
  -- Unique constraint: same repo + branch + checksum = same version
  constraint integration_manifests_unique_checksum unique (repo_full_name, default_branch, content_checksum),
  
  -- Foreign key to previous version
  constraint integration_manifests_previous_version_fk 
    foreign key (previous_version_id) references public.integration_manifests (manifest_id) on delete set null
);

-- Indexes for efficient queries
create index if not exists integration_manifests_repo_branch_idx
  on public.integration_manifests (repo_full_name, default_branch, created_at desc);

create index if not exists integration_manifests_checksum_idx
  on public.integration_manifests (content_checksum);

create index if not exists integration_manifests_previous_version_idx
  on public.integration_manifests (previous_version_id);

-- Enable row-level security (allow all reads/writes for now; can be restricted later)
alter table public.integration_manifests enable row level security;

-- Policy: allow all operations (can be restricted later based on auth requirements)
drop policy if exists "Allow all operations on integration_manifests" on public.integration_manifests;
create policy "Allow all operations on integration_manifests"
  on public.integration_manifests
  for all
  using (true)
  with check (true);

-- Function to get or create manifest with version reuse
-- Returns the manifest_id and a boolean indicating if it was newly created
create or replace function public.get_or_create_integration_manifest(
  p_repo_full_name text,
  p_default_branch text,
  p_schema_version text,
  p_goal text,
  p_stack jsonb,
  p_constraints jsonb,
  p_conventions jsonb,
  p_content_checksum text
) returns table (
  manifest_id uuid,
  is_new boolean,
  created_at timestamptz
) as $$
declare
  v_existing_id uuid;
  v_previous_version_id uuid;
  v_new_id uuid;
begin
  -- Check if manifest with this checksum already exists
  select m.manifest_id into v_existing_id
  from public.integration_manifests m
  where m.repo_full_name = p_repo_full_name
    and m.default_branch = p_default_branch
    and m.content_checksum = p_content_checksum
  limit 1;
  
  if v_existing_id is not null then
    -- Return existing manifest (reuse)
    return query
    select 
      v_existing_id as manifest_id,
      false as is_new,
      (select created_at from public.integration_manifests where manifest_id = v_existing_id) as created_at;
    return;
  end if;
  
  -- Get the latest version for this repo/branch to link as previous
  select m.manifest_id into v_previous_version_id
  from public.integration_manifests m
  where m.repo_full_name = p_repo_full_name
    and m.default_branch = p_default_branch
  order by m.created_at desc
  limit 1;
  
  -- Create new manifest version
  insert into public.integration_manifests (
    repo_full_name,
    default_branch,
    schema_version,
    goal,
    stack,
    constraints,
    conventions,
    content_checksum,
    previous_version_id
  ) values (
    p_repo_full_name,
    p_default_branch,
    p_schema_version,
    p_goal,
    p_stack,
    p_constraints,
    p_conventions,
    p_content_checksum,
    v_previous_version_id
  )
  returning manifest_id into v_new_id;
  
  -- Return new manifest
  return query
  select 
    v_new_id as manifest_id,
    true as is_new,
    (select created_at from public.integration_manifests where manifest_id = v_new_id) as created_at;
end;
$$ language plpgsql;

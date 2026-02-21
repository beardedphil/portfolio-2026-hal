-- Migration: Add integration manifests table for HAL (0177)
-- Enables deterministic, auto-generated Integration Manifest v0 generation + versioning
-- so HAL can reliably derive and persist project_manifest.goal/stack/constraints/conventions
-- from a repo + known environment identifiers + a schema version.

-- Enable gen_random_uuid() if not already enabled
create extension if not exists pgcrypto;

-- Create hal_integration_manifests table
create table if not exists hal_integration_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  default_branch text not null,
  schema_version text not null default 'v0',
  manifest_json jsonb not null,
  content_checksum text not null,
  version_id text not null, -- Deterministic version ID (e.g., content hash or sequential)
  previous_version_id text, -- Link to previous version if content changed
  created_at timestamptz not null default now(),
  created_by text, -- Actor/agent identifier (e.g., 'user:uuid', 'system')
  
  -- Ensure unique version_id per repo
  constraint hal_integration_manifests_repo_version_key unique (repo_full_name, version_id),
  
  -- Foreign key to previous version (self-referential)
  constraint hal_integration_manifests_previous_fk 
    foreign key (repo_full_name, previous_version_id) 
    references hal_integration_manifests(repo_full_name, version_id) 
    on delete set null
);

-- Indexes for common queries
create index if not exists idx_hal_integration_manifests_repo on hal_integration_manifests(repo_full_name);
create index if not exists idx_hal_integration_manifests_checksum on hal_integration_manifests(content_checksum);
create index if not exists idx_hal_integration_manifests_version_id on hal_integration_manifests(repo_full_name, version_id);
create index if not exists idx_hal_integration_manifests_created_at on hal_integration_manifests(created_at desc);

-- Index for latest version query
create index if not exists idx_hal_integration_manifests_latest 
  on hal_integration_manifests(repo_full_name, created_at desc);

-- Function to prevent updates (enforce immutability)
-- This trigger ensures that existing rows cannot be updated, only new versions can be inserted
create or replace function prevent_integration_manifest_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Integration manifests are immutable. Cannot update existing version. Insert a new version instead.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to enforce immutability
create trigger prevent_integration_manifest_updates_trigger
  before update on hal_integration_manifests
  for each row
  execute function prevent_integration_manifest_updates();

-- Function to get latest manifest for a repo
create or replace function get_latest_integration_manifest(
  p_repo_full_name text
)
returns table (
  manifest_id uuid,
  repo_full_name text,
  default_branch text,
  schema_version text,
  manifest_json jsonb,
  content_checksum text,
  version_id text,
  previous_version_id text,
  created_at timestamptz,
  created_by text
) as $$
begin
  return query
  select 
    m.manifest_id,
    m.repo_full_name,
    m.default_branch,
    m.schema_version,
    m.manifest_json,
    m.content_checksum,
    m.version_id,
    m.previous_version_id,
    m.created_at,
    m.created_by
  from hal_integration_manifests m
  where m.repo_full_name = p_repo_full_name
  order by m.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

-- Enable RLS (Row Level Security)
alter table hal_integration_manifests enable row level security;

-- Policy: Allow anon users to read integration manifests (for browsing)
create policy "Allow anon read integration manifests"
  on hal_integration_manifests
  for select
  using (true);

-- Policy: Allow anon users to insert integration manifests (for creation)
create policy "Allow anon insert integration manifests"
  on hal_integration_manifests
  for insert
  with check (true);

-- Note: Updates are blocked by the trigger, so no update policy is needed.
-- Service role key bypasses RLS, so server APIs using service role can perform all operations.

comment on table hal_integration_manifests is 'Versioned integration manifests for HAL repositories. Each manifest contains deterministic project metadata (goal, stack, constraints, conventions) derived from repo sources.';
comment on column hal_integration_manifests.manifest_json is 'JSON object containing the manifest content (goal, stack, constraints, conventions, etc.)';
comment on column hal_integration_manifests.content_checksum is 'SHA-256 checksum of canonicalized manifest_json for deterministic versioning';
comment on column hal_integration_manifests.version_id is 'Deterministic version identifier (typically the content_checksum or a derived value)';
comment on column hal_integration_manifests.previous_version_id is 'Link to previous version_id if content changed, null if this is the first version or content is identical';

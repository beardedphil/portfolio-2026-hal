-- Ticket HAL-0773: Create Integration Manifest v0 storage
--
-- Goal:
-- - Store Integration Manifest versions as versioned JSON in Supabase
-- - Support deterministic checksums for content verification
-- - Enable "latest" query per repo
-- - Ensure immutability (no updates, only inserts)
-- - Link versions via previous_version_id for version chain

-- Enable gen_random_uuid() if not already enabled
create extension if not exists pgcrypto;

-- Create integration_manifests table
create table if not exists integration_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  default_branch text not null,
  schema_version text not null default 'v0',
  version integer not null,
  manifest_json jsonb not null,
  content_checksum text not null,
  previous_version_id uuid, -- Links to previous version for version chain
  created_at timestamptz not null default now(),
  created_by text, -- Actor/agent identifier (e.g., 'user:uuid', 'system')
  
  -- Ensure unique version per repo per schema version
  constraint integration_manifests_repo_version_key unique (repo_full_name, schema_version, version),
  
  -- Foreign key to previous version (self-referential)
  constraint integration_manifests_previous_version_fk 
    foreign key (previous_version_id) references integration_manifests(manifest_id) on delete set null
);

-- Indexes for common queries
create index if not exists idx_integration_manifests_repo on integration_manifests(repo_full_name, schema_version);
create index if not exists idx_integration_manifests_checksum on integration_manifests(content_checksum);
create index if not exists idx_integration_manifests_created_at on integration_manifests(created_at desc);
create index if not exists idx_integration_manifests_previous_version on integration_manifests(previous_version_id);

-- Index for "latest" query optimization
-- This composite index supports the query: WHERE repo_full_name = X AND schema_version = Y ORDER BY version DESC
create index if not exists idx_integration_manifests_latest 
  on integration_manifests(repo_full_name, schema_version, version desc, created_at desc);

-- Function to prevent updates (enforce immutability)
create or replace function prevent_manifest_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Integration manifests are immutable. Cannot update existing version. Insert a new version instead.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to enforce immutability
create trigger prevent_manifest_updates_trigger
  before update on integration_manifests
  for each row
  execute function prevent_manifest_updates();

-- Function to get latest manifest for a repo
create or replace function get_latest_manifest(
  p_repo_full_name text,
  p_schema_version text default 'v0'
)
returns table (
  manifest_id uuid,
  repo_full_name text,
  default_branch text,
  schema_version text,
  version integer,
  manifest_json jsonb,
  content_checksum text,
  previous_version_id uuid,
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
    m.version,
    m.manifest_json,
    m.content_checksum,
    m.previous_version_id,
    m.created_at,
    m.created_by
  from integration_manifests m
  where m.repo_full_name = p_repo_full_name
    and m.schema_version = p_schema_version
  order by m.version desc, m.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

-- Function to find existing manifest by checksum (for reuse detection)
create or replace function find_manifest_by_checksum(
  p_repo_full_name text,
  p_content_checksum text,
  p_schema_version text default 'v0'
)
returns table (
  manifest_id uuid,
  repo_full_name text,
  default_branch text,
  schema_version text,
  version integer,
  manifest_json jsonb,
  content_checksum text,
  previous_version_id uuid,
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
    m.version,
    m.manifest_json,
    m.content_checksum,
    m.previous_version_id,
    m.created_at,
    m.created_by
  from integration_manifests m
  where m.repo_full_name = p_repo_full_name
    and m.content_checksum = p_content_checksum
    and m.schema_version = p_schema_version
  order by m.version desc, m.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

-- Enable RLS (Row Level Security)
alter table integration_manifests enable row level security;

-- Policy: Allow anon users to read manifests (for browsing)
create policy "Allow anon read integration manifests"
  on integration_manifests
  for select
  using (true);

-- Policy: Allow anon users to insert manifests (for creation)
create policy "Allow anon insert integration manifests"
  on integration_manifests
  for insert
  with check (true);

-- Note: Updates are blocked by the trigger, so no update policy is needed.
-- Service role key bypasses RLS, so server APIs using service role can perform all operations.

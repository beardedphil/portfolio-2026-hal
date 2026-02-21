-- Ticket HAL-0761: Create first-class Supabase storage for Context Bundles and Bundle Receipts
--
-- Goal:
-- - Store Context Bundle versions as versioned JSON in Supabase
-- - Store Bundle Receipts with checksums and per-section character metrics
-- - Support deterministic checksums for content verification
-- - Enable "latest" query per ticket per role
-- - Ensure immutability (no updates, only inserts)

-- Enable gen_random_uuid() if not already enabled
create extension if not exists pgcrypto;

-- Create context_bundles table
create table if not exists context_bundles (
  bundle_id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  ticket_pk uuid not null,
  ticket_id text not null, -- Display ID (e.g., "HAL-0761")
  role text not null, -- Agent role: 'implementation-agent', 'qa-agent', 'project-manager'
  version integer not null,
  bundle_json jsonb not null, -- Full context bundle content
  content_checksum text not null, -- SHA-256 checksum of bundle_json
  bundle_checksum text not null, -- SHA-256 checksum of entire bundle (includes metadata)
  created_at timestamptz not null default now(),
  created_by text, -- Actor/agent identifier (e.g., 'implementation-agent', 'user:uuid')
  
  -- Ensure unique version per ticket per role
  constraint context_bundles_repo_ticket_role_version_key unique (repo_full_name, ticket_pk, role, version),
  
  -- Foreign key to tickets table
  constraint context_bundles_ticket_fk foreign key (ticket_pk) references tickets(pk) on delete cascade
);

-- Create bundle_receipts table
create table if not exists bundle_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null, -- Links to context_bundles
  repo_full_name text not null,
  ticket_pk uuid not null,
  ticket_id text not null,
  role text not null,
  content_checksum text not null, -- Same as bundle.content_checksum
  bundle_checksum text not null, -- Same as bundle.bundle_checksum
  section_metrics jsonb not null, -- Per-section character counts: { "ticket": 1234, "repo_context": 5678, ... }
  total_characters integer not null, -- Sum of all section_metrics values
  red_reference jsonb, -- RED reference: { "red_id": "...", "version": 1 } or null
  integration_manifest_reference jsonb, -- Integration manifest reference: { "manifest_id": "...", "version": 1, "schema_version": "v0" } or null
  git_ref jsonb, -- Git reference: { "pr_url": "...", "pr_number": 123, "base_sha": "...", "head_sha": "..." } or null
  created_at timestamptz not null default now(),
  
  -- Foreign key to context_bundles
  constraint bundle_receipts_bundle_fk foreign key (bundle_id) references context_bundles(bundle_id) on delete cascade,
  
  -- Foreign key to tickets table
  constraint bundle_receipts_ticket_fk foreign key (ticket_pk) references tickets(pk) on delete cascade,
  
  -- One receipt per bundle (1:1 relationship)
  constraint bundle_receipts_bundle_id_key unique (bundle_id)
);

-- Indexes for common queries
create index if not exists idx_context_bundles_repo_ticket on context_bundles(repo_full_name, ticket_pk);
create index if not exists idx_context_bundles_ticket_pk on context_bundles(ticket_pk);
create index if not exists idx_context_bundles_role on context_bundles(role);
create index if not exists idx_context_bundles_checksum on context_bundles(content_checksum);
create index if not exists idx_context_bundles_created_at on context_bundles(created_at desc);

-- Index for "latest" query optimization per ticket per role
create index if not exists idx_context_bundles_latest 
  on context_bundles(repo_full_name, ticket_pk, role, version desc, created_at desc);

-- Indexes for bundle_receipts
create index if not exists idx_bundle_receipts_bundle_id on bundle_receipts(bundle_id);
create index if not exists idx_bundle_receipts_ticket_pk on bundle_receipts(ticket_pk);
create index if not exists idx_bundle_receipts_created_at on bundle_receipts(created_at desc);

-- Function to prevent updates (enforce immutability)
create or replace function prevent_context_bundle_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Context bundles are immutable. Cannot update existing version. Insert a new version instead.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to enforce immutability
create trigger prevent_context_bundle_updates_trigger
  before update on context_bundles
  for each row
  execute function prevent_context_bundle_updates();

-- Function to prevent updates on receipts (enforce immutability)
create or replace function prevent_bundle_receipt_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Bundle receipts are immutable. Cannot update existing receipt. Create a new bundle to generate a new receipt.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to enforce immutability
create trigger prevent_bundle_receipt_updates_trigger
  before update on bundle_receipts
  for each row
  execute function prevent_bundle_receipt_updates();

-- Function to get latest bundle for a ticket and role
create or replace function get_latest_context_bundle(
  p_repo_full_name text,
  p_ticket_pk uuid,
  p_role text
)
returns table (
  bundle_id uuid,
  repo_full_name text,
  ticket_pk uuid,
  ticket_id text,
  role text,
  version integer,
  bundle_json jsonb,
  content_checksum text,
  bundle_checksum text,
  created_at timestamptz,
  created_by text
) as $$
begin
  return query
  select 
    b.bundle_id,
    b.repo_full_name,
    b.ticket_pk,
    b.ticket_id,
    b.role,
    b.version,
    b.bundle_json,
    b.content_checksum,
    b.bundle_checksum,
    b.created_at,
    b.created_by
  from context_bundles b
  where b.repo_full_name = p_repo_full_name
    and b.ticket_pk = p_ticket_pk
    and b.role = p_role
  order by b.version desc, b.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

-- Enable RLS (Row Level Security)
alter table context_bundles enable row level security;
alter table bundle_receipts enable row level security;

-- Policy: Allow anon users to read context bundles (for browsing)
create policy "Allow anon read context bundles"
  on context_bundles
  for select
  using (true);

-- Policy: Allow anon users to insert context bundles (for creation)
create policy "Allow anon insert context bundles"
  on context_bundles
  for insert
  with check (true);

-- Policy: Allow anon users to read bundle receipts (for browsing)
create policy "Allow anon read bundle receipts"
  on bundle_receipts
  for select
  using (true);

-- Policy: Allow anon users to insert bundle receipts (for creation)
create policy "Allow anon insert bundle receipts"
  on bundle_receipts
  for insert
  with check (true);

-- Note: Updates are blocked by triggers, so no update policies are needed.
-- Service role key bypasses RLS, so server APIs using service role can perform all operations.

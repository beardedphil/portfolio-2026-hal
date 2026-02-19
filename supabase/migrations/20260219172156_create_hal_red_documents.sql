-- Ticket HAL-0757: Create first-class storage for Requirement Expansion Documents (RED)
--
-- Goal:
-- - Store RED versions as versioned JSON in Supabase
-- - Support deterministic checksums for content verification
-- - Enable "latest valid" query per ticket
-- - Ensure immutability (no updates, only inserts)

-- Enable gen_random_uuid() if not already enabled
create extension if not exists pgcrypto;

-- Create enum for validation status
create type red_validation_status as enum ('valid', 'invalid', 'pending');

-- Create hal_red_documents table
create table if not exists hal_red_documents (
  red_id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  ticket_pk uuid not null,
  version integer not null,
  red_json jsonb not null,
  content_checksum text not null,
  validation_status red_validation_status not null default 'pending',
  created_at timestamptz not null default now(),
  created_by text, -- Actor/agent identifier (e.g., 'implementation-agent', 'user:uuid')
  artifact_id uuid, -- Optional: link to mirrored artifact
  
  -- Ensure unique version per ticket per repo
  constraint hal_red_documents_repo_ticket_version_key unique (repo_full_name, ticket_pk, version),
  
  -- Foreign key to tickets table (if it exists)
  constraint hal_red_documents_ticket_fk foreign key (ticket_pk) references tickets(pk) on delete cascade
);

-- Indexes for common queries
create index if not exists idx_hal_red_documents_repo_ticket on hal_red_documents(repo_full_name, ticket_pk);
create index if not exists idx_hal_red_documents_ticket_pk on hal_red_documents(ticket_pk);
create index if not exists idx_hal_red_documents_checksum on hal_red_documents(content_checksum);
create index if not exists idx_hal_red_documents_validation_status on hal_red_documents(validation_status);
create index if not exists idx_hal_red_documents_created_at on hal_red_documents(created_at desc);

-- Index for "latest valid" query optimization
-- This composite index supports the query: WHERE repo_full_name = X AND ticket_pk = Y AND validation_status = 'valid' ORDER BY version DESC, created_at DESC
create index if not exists idx_hal_red_documents_latest_valid 
  on hal_red_documents(repo_full_name, ticket_pk, validation_status, version desc, created_at desc)
  where validation_status = 'valid';

-- Function to prevent updates (enforce immutability)
-- This trigger ensures that existing rows cannot be updated, only new versions can be inserted
create or replace function prevent_red_document_updates()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'RED documents are immutable. Cannot update existing version. Insert a new version instead.';
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to enforce immutability
create trigger prevent_red_document_updates_trigger
  before update on hal_red_documents
  for each row
  execute function prevent_red_document_updates();

-- Function to get latest valid RED for a ticket
-- This provides a deterministic query that resolves ties consistently
create or replace function get_latest_valid_red(
  p_repo_full_name text,
  p_ticket_pk uuid
)
returns table (
  red_id uuid,
  repo_full_name text,
  ticket_pk uuid,
  version integer,
  red_json jsonb,
  content_checksum text,
  validation_status red_validation_status,
  created_at timestamptz,
  created_by text,
  artifact_id uuid
) as $$
begin
  return query
  select 
    r.red_id,
    r.repo_full_name,
    r.ticket_pk,
    r.version,
    r.red_json,
    r.content_checksum,
    r.validation_status,
    r.created_at,
    r.created_by,
    r.artifact_id
  from hal_red_documents r
  where r.repo_full_name = p_repo_full_name
    and r.ticket_pk = p_ticket_pk
    and r.validation_status = 'valid'
  order by r.version desc, r.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

-- Enable RLS (Row Level Security)
alter table hal_red_documents enable row level security;

-- Policy: Allow anon users to read RED documents (for browsing)
create policy "Allow anon read red documents"
  on hal_red_documents
  for select
  using (true);

-- Policy: Allow anon users to insert RED documents (for creation)
create policy "Allow anon insert red documents"
  on hal_red_documents
  for insert
  with check (true);

-- Note: Updates are blocked by the trigger, so no update policy is needed.
-- Service role key bypasses RLS, so server APIs using service role can perform all operations.

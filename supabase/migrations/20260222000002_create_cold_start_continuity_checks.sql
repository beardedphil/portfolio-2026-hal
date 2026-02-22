-- Ticket HAL-0774: Create table for storing cold-start continuity check results
--
-- Goal:
-- - Store results of cold-start continuity checks
-- - Track verdict (PASS/FAIL), run timestamp, run ID
-- - Store failure reasons and comparison details
-- - Enable history queries (last 10 runs)

-- Create cold_start_continuity_checks table
create table if not exists cold_start_continuity_checks (
  check_id uuid primary key default gen_random_uuid(),
  run_id text not null, -- Unique identifier for this run
  repo_full_name text not null,
  ticket_pk uuid not null,
  ticket_id text not null, -- Display ID (e.g., "HAL-0774")
  role text not null, -- Agent role: 'implementation-agent', 'qa-agent', 'project-manager'
  verdict text not null check (verdict in ('PASS', 'FAIL')),
  failure_reason text, -- One of: 'missing_receipt', 'checksum_mismatch', 'missing_manifest_reference', 'artifact_version_mismatch'
  baseline_bundle_id uuid, -- The bundle_id from the receipt (baseline)
  rebuilt_bundle_id uuid, -- The bundle_id from the rebuilt bundle (if successful)
  baseline_content_checksum text, -- From receipt
  rebuilt_content_checksum text, -- From rebuilt bundle
  baseline_bundle_checksum text, -- From receipt
  rebuilt_bundle_checksum text, -- From rebuilt bundle
  comparison_details jsonb, -- Additional comparison details: { "checksums_match": true, "manifest_reference_match": true, ... }
  summary text, -- Short summary of what was checked
  created_at timestamptz not null default now(),
  
  -- Foreign key to tickets table
  constraint cold_start_continuity_checks_ticket_fk foreign key (ticket_pk) references tickets(pk) on delete cascade,
  
  -- Foreign key to context_bundles (baseline)
  constraint cold_start_continuity_checks_baseline_bundle_fk foreign key (baseline_bundle_id) references context_bundles(bundle_id) on delete set null,
  
  -- Foreign key to context_bundles (rebuilt)
  constraint cold_start_continuity_checks_rebuilt_bundle_fk foreign key (rebuilt_bundle_id) references context_bundles(bundle_id) on delete set null,
  
  -- Ensure unique run_id
  constraint cold_start_continuity_checks_run_id_key unique (run_id)
);

-- Indexes for common queries
create index if not exists idx_cold_start_continuity_checks_ticket_pk on cold_start_continuity_checks(ticket_pk);
create index if not exists idx_cold_start_continuity_checks_repo_ticket on cold_start_continuity_checks(repo_full_name, ticket_pk);
create index if not exists idx_cold_start_continuity_checks_created_at on cold_start_continuity_checks(created_at desc);
create index if not exists idx_cold_start_continuity_checks_run_id on cold_start_continuity_checks(run_id);

-- Enable RLS (Row Level Security)
alter table cold_start_continuity_checks enable row level security;

-- Policy: Allow anon users to read continuity checks (for browsing)
create policy "Allow anon read cold start continuity checks"
  on cold_start_continuity_checks
  for select
  using (true);

-- Policy: Allow anon users to insert continuity checks (for creation)
create policy "Allow anon insert cold start continuity checks"
  on cold_start_continuity_checks
  for insert
  with check (true);

-- Note: Service role key bypasses RLS, so server APIs using service role can perform all operations.

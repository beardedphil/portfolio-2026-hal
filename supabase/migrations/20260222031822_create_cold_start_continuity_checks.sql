-- Ticket HAL-0774: Create table for Cold-start Continuity Check results
--
-- Goal:
-- - Store results of cold-start continuity checks (fresh rebuilds of context bundles)
-- - Track PASS/FAIL verdicts with detailed comparison data
-- - Enable history of checks for review

-- Create cold_start_continuity_checks table
create table if not exists cold_start_continuity_checks (
  run_id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null, -- Reference to context_bundles.bundle_id
  receipt_id uuid, -- Reference to bundle_receipts.receipt_id (optional, for convenience)
  repo_full_name text not null,
  ticket_pk uuid not null,
  ticket_id text not null,
  role text not null,
  verdict text not null check (verdict in ('PASS', 'FAIL')),
  completed_at timestamptz not null default now(),
  baseline_content_checksum text not null, -- From receipt
  baseline_bundle_checksum text not null, -- From receipt
  rebuilt_content_checksum text, -- From fresh rebuild (null if rebuild failed)
  rebuilt_bundle_checksum text, -- From fresh rebuild (null if rebuild failed)
  failure_reason text, -- One of: 'missing_receipt', 'checksum_mismatch', 'missing_manifest_reference', 'artifact_version_mismatch', or error message
  summary text, -- Short summary of what was checked
  comparisons jsonb, -- Detailed comparison data: { "content_checksum_match": true/false, "bundle_checksum_match": true/false, ... }
  created_at timestamptz not null default now(),
  
  -- Foreign key to context_bundles
  constraint cold_start_checks_bundle_fk foreign key (bundle_id) references context_bundles(bundle_id) on delete cascade,
  
  -- Foreign key to bundle_receipts (optional)
  constraint cold_start_checks_receipt_fk foreign key (receipt_id) references bundle_receipts(receipt_id) on delete set null
);

-- Create indexes for efficient queries
create index if not exists idx_cold_start_checks_bundle_id on cold_start_continuity_checks(bundle_id);
create index if not exists idx_cold_start_checks_receipt_id on cold_start_continuity_checks(receipt_id);
create index if not exists idx_cold_start_checks_ticket_pk on cold_start_continuity_checks(ticket_pk);
create index if not exists idx_cold_start_checks_repo_ticket on cold_start_continuity_checks(repo_full_name, ticket_pk);
create index if not exists idx_cold_start_checks_completed_at on cold_start_continuity_checks(completed_at desc);
create index if not exists idx_cold_start_checks_verdict on cold_start_continuity_checks(verdict);

-- Add comments
comment on table cold_start_continuity_checks is 'Stores results of cold-start continuity checks (fresh rebuilds of context bundles to verify deterministic checksums)';
comment on column cold_start_continuity_checks.verdict is 'PASS if checksums match, FAIL otherwise';
comment on column cold_start_continuity_checks.failure_reason is 'Failure reason: missing_receipt, checksum_mismatch, missing_manifest_reference, artifact_version_mismatch, or error message';
comment on column cold_start_continuity_checks.comparisons is 'Detailed comparison data: { "content_checksum_match": true/false, "bundle_checksum_match": true/false, "baseline_checksums": {...}, "rebuilt_checksums": {...} }';

-- Enable RLS
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

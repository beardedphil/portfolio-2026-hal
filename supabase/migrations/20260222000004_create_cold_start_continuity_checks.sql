-- Cold-start continuity checks
-- Goal:
-- - Store results of cold-start continuity checks that verify bundles can be rebuilt deterministically
-- - Track checksum comparisons, missing receipts, manifest references, and artifact version mismatches

create table if not exists public.cold_start_continuity_checks (
  check_id uuid primary key default gen_random_uuid(),
  run_id text not null unique, -- Unique identifier for this run (e.g., timestamp-based)
  repo_full_name text not null,
  
  -- Verdict
  verdict text not null, -- 'PASS' | 'FAIL'
  failure_reason text null, -- 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch'
  
  -- Check details
  baseline_checksum text null, -- Checksum from stored bundle/receipt
  rebuilt_checksum text null, -- Checksum from rebuilt bundle
  checksum_match boolean null, -- true if checksums match
  
  -- References checked
  bundle_id uuid null references public.context_bundles(bundle_id) on delete set null,
  receipt_id uuid null references public.bundle_receipts(receipt_id) on delete set null,
  integration_manifest_reference jsonb null, -- Reference from receipt
  red_reference jsonb null, -- RED reference from receipt
  
  -- Summary of what was checked
  summary text null, -- Human-readable summary of what was checked
  
  -- Timestamps
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cold_start_continuity_checks_repo_idx
  on public.cold_start_continuity_checks (repo_full_name, completed_at desc);

create index if not exists cold_start_continuity_checks_run_id_idx
  on public.cold_start_continuity_checks (run_id);

create index if not exists cold_start_continuity_checks_verdict_idx
  on public.cold_start_continuity_checks (verdict, completed_at desc);

alter table public.cold_start_continuity_checks disable row level security;

-- Cold-start continuity checks tracking
-- Goal:
-- - Store results of cold-start continuity checks
-- - Track verdict (PASS/FAIL), run timestamp, run ID, and detailed results
-- - Enable history of last 10+ runs for review

create table if not exists public.cold_start_continuity_checks (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique, -- Unique identifier for this run
  run_timestamp timestamptz not null default now(),
  
  -- Verdict
  verdict text not null, -- 'PASS' | 'FAIL'
  
  -- Failure reason (if verdict is FAIL)
  failure_reason text null, -- 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch'
  
  -- Summary of what was checked
  summary text null,
  
  -- Detailed results (stored as JSONB for flexibility)
  details jsonb null, -- { baseline_checksum, rebuilt_checksum, receipt_id, manifest_reference, etc. }
  
  -- Error information if check failed
  error_message text null,
  
  created_at timestamptz not null default now()
);

create index if not exists cold_start_continuity_checks_run_timestamp_idx
  on public.cold_start_continuity_checks (run_timestamp desc);

create index if not exists cold_start_continuity_checks_verdict_idx
  on public.cold_start_continuity_checks (verdict);

alter table public.cold_start_continuity_checks disable row level security;

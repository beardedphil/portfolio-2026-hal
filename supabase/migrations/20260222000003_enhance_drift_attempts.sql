-- Ticket HAL-0766: Enhance drift_attempts table to support transition tracking and normalized reasons
-- 
-- Adds:
-- - transition: transition name (e.g., "To-do → Ready for QA")
-- - failure_reasons: normalized reason types and messages (JSONB array)
-- - references: PR URL, checksums, manifest/red references (JSONB object)

alter table if exists public.drift_attempts
  add column if not exists transition text null,
  add column if not exists failure_reasons jsonb null default '[]'::jsonb,
  add column if not exists references jsonb null default '{}'::jsonb;

-- Add comment for documentation
comment on column public.drift_attempts.transition is 'Transition name (e.g., "To-do → Ready for QA")';
comment on column public.drift_attempts.failure_reasons is 'Array of normalized failure reasons: [{ type: string, message: string }]';
comment on column public.drift_attempts.references is 'References object: { pr_url?: string, head_sha?: string, manifest_id?: string, red_id?: string, checksum?: string }';

-- Create index for transition queries
create index if not exists drift_attempts_transition_idx
  on public.drift_attempts (ticket_pk, transition, attempted_at desc);

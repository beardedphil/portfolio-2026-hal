-- Drift gate CI evaluation tracking
-- Goal:
-- - Store CI evaluation results for each drift gate attempt
-- - Track evaluated head SHA, overall status, and required-checks breakdown
-- - Persist drift check attempts per transition (pass/fail + reasons) for auditability (HAL-0766)

create table if not exists public.drift_attempts (
  id uuid primary key default gen_random_uuid(),
  ticket_pk uuid not null references public.tickets(pk) on delete cascade,
  attempted_at timestamptz not null default now(),
  
  -- Transition information
  transition text not null, -- Column ID or transition name (e.g., 'col-qa', 'col-human-in-the-loop')
  
  -- PR information
  pr_url text null,
  pr_number integer null, -- Extracted from PR URL for easier querying
  
  -- CI evaluation results
  evaluated_head_sha text null,
  head_sha text null, -- Head SHA from PR (may differ from evaluated_head_sha if evaluation failed)
  overall_status text null, -- 'passing' | 'failing' | 'pending' | 'running' | 'unknown'
  
  -- Required checks breakdown (stored as JSONB for flexibility)
  required_checks jsonb null, -- { unit: { status, conclusion, name, htmlUrl }, e2e: { status, conclusion, name, htmlUrl } }
  
  -- Failing check names (array for easy querying)
  failing_check_names text[] null,
  
  -- Checks page URL for linking
  checks_page_url text null,
  
  -- Error information if evaluation failed
  evaluation_error text null,
  
  -- Normalized failure reasons (HAL-0766)
  reason_types text[] null, -- Array of normalized reason types (e.g., ['NO_PR_LINKED', 'CI_CHECKS_FAILING', 'UNMET_AC'])
  reason_messages text[] null, -- Array of human-readable reason messages (stable ordering)
  
  -- References (JSONB for flexibility) - PR URL, checksums, manifest/red references
  references jsonb null, -- { pr_url?: string, checksums?: Record<string, string>, manifest_ref?: string, red_ref?: string }
  
  -- Whether the transition was blocked
  blocked boolean not null default false,
  
  created_at timestamptz not null default now()
);

create index if not exists drift_attempts_ticket_pk_idx
  on public.drift_attempts (ticket_pk, attempted_at desc);

create index if not exists drift_attempts_transition_idx
  on public.drift_attempts (ticket_pk, transition, attempted_at desc);

create index if not exists drift_attempts_pr_url_idx
  on public.drift_attempts (pr_url) where pr_url is not null;

create index if not exists drift_attempts_pr_number_idx
  on public.drift_attempts (pr_number) where pr_number is not null;

alter table public.drift_attempts disable row level security;

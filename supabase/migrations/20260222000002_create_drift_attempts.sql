-- Drift gate CI evaluation tracking
-- Goal:
-- - Store CI evaluation results for each drift gate attempt
-- - Track evaluated head SHA, overall status, and required-checks breakdown

create table if not exists public.drift_attempts (
  id uuid primary key default gen_random_uuid(),
  ticket_pk uuid not null references public.tickets(pk) on delete cascade,
  attempted_at timestamptz not null default now(),
  
  -- PR information
  pr_url text null,
  
  -- CI evaluation results
  evaluated_head_sha text null,
  overall_status text null, -- 'passing' | 'failing' | 'pending' | 'running' | 'unknown'
  
  -- Required checks breakdown (stored as JSONB for flexibility)
  required_checks jsonb null, -- { unit: { status, conclusion, name, htmlUrl }, e2e: { status, conclusion, name, htmlUrl } }
  
  -- Failing check names (array for easy querying)
  failing_check_names text[] null,
  
  -- Checks page URL for linking
  checks_page_url text null,
  
  -- Error information if evaluation failed
  evaluation_error text null,
  
  -- Whether the transition was blocked
  blocked boolean not null default false,
  
  created_at timestamptz not null default now()
);

create index if not exists drift_attempts_ticket_pk_idx
  on public.drift_attempts (ticket_pk, attempted_at desc);

create index if not exists drift_attempts_pr_url_idx
  on public.drift_attempts (pr_url) where pr_url is not null;

alter table public.drift_attempts disable row level security;

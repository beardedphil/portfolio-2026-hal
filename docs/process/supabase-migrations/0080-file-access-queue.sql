-- Ticket 0080: Durable file access queue (Supabase-backed)
--
-- Goal:
-- - Replace dev-only, in-memory /api/pm/file-access queue with a Supabase-backed queue
-- - Allow the PM agent (server) to request a file read/search
-- - Allow the browser (with a locally-connected folder) to fulfill requests and submit results
-- - Scope requests to a per-browser session token (untrusted but unguessable)
--
-- Notes:
-- - This is a best-effort bridge for local folder access. It is NOT required for GitHub-first flows.
-- - For v1, we disable RLS to avoid blocking functionality. Revisit security later.
-- - Results are truncated client-side (max lines / capped matches).

create table if not exists public.hal_file_access_requests (
  request_id text primary key,
  session_id text not null,
  project_id text null,
  request_type text not null,
  path text null,
  pattern text null,
  glob text null,
  max_lines int null,

  status text not null default 'pending', -- pending | completed
  result_success boolean null,
  result_content text null,
  result_matches jsonb null,
  result_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists hal_file_access_requests_session_pending_idx
  on public.hal_file_access_requests (session_id, status, created_at);

create index if not exists hal_file_access_requests_project_pending_idx
  on public.hal_file_access_requests (project_id, status, created_at);

-- Keep updated_at fresh
create or replace function public.hal_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hal_file_access_requests_touch on public.hal_file_access_requests;
create trigger hal_file_access_requests_touch
before update on public.hal_file_access_requests
for each row execute function public.hal_touch_updated_at();

-- v1: disable RLS for functionality (tighten later)
alter table public.hal_file_access_requests disable row level security;


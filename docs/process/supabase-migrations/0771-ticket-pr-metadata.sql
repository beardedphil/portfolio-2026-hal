-- Ticket 0771: Add PR metadata to tickets table
--
-- Goal:
-- - Store PR URL, PR number, branch name, and commit SHAs on tickets
-- - Enable "Create branch + draft PR" automation
-- - Support drift/CI gating using PR as canonical anchor

alter table public.tickets add column if not exists pr_url text null;
alter table public.tickets add column if not exists pr_number int null;
alter table public.tickets add column if not exists branch_name text null;
alter table public.tickets add column if not exists base_commit_sha text null;
alter table public.tickets add column if not exists head_commit_sha text null;

-- Index for querying tickets by PR URL
create index if not exists tickets_pr_url_idx on public.tickets (pr_url) where pr_url is not null;

-- Index for querying tickets by branch name
create index if not exists tickets_branch_name_idx on public.tickets (branch_name) where branch_name is not null;

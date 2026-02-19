-- Ticket 0771: Add GitHub PR fields to tickets table
--
-- Goal:
-- - Store PR URL, PR number, branch name, and commit SHAs for each ticket
-- - Enable PR creation automation and drift/CI gating

-- Add GitHub PR fields to tickets table
alter table public.tickets add column if not exists github_pr_url text null;
alter table public.tickets add column if not exists github_pr_number int null;
alter table public.tickets add column if not exists github_branch_name text null;
alter table public.tickets add column if not exists github_base_commit_sha text null;
alter table public.tickets add column if not exists github_head_commit_sha text null;

-- Add index for PR URL lookups
create index if not exists tickets_github_pr_url_idx on public.tickets (github_pr_url) where github_pr_url is not null;

-- Add index for branch name lookups
create index if not exists tickets_github_branch_name_idx on public.tickets (github_branch_name) where github_branch_name is not null;

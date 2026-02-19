-- Ticket 0771: Add pr_url field to tickets table
--
-- Goal:
-- - Add pr_url field to tickets table to store GitHub pull request URLs
-- - This enables the "Create branch + draft PR" automation feature
--
-- Notes:
-- - pr_url is nullable (tickets may not have PRs yet)
-- - pr_url stores the full GitHub PR URL (e.g. https://github.com/owner/repo/pull/123)

-- Add pr_url column to tickets table
alter table public.tickets add column if not exists pr_url text null;

-- Add index for faster lookups by PR URL (optional but helpful)
create index if not exists tickets_pr_url_idx on public.tickets (pr_url) where pr_url is not null;

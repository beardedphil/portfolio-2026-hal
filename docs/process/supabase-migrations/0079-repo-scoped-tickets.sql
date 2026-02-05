-- Ticket 0079: Repo-scoped ticket IDs (shared per repo)
--
-- Goal:
-- - Allow ticket numbers to repeat per repo (e.g. 0079 in multiple repos)
-- - Keep a stable internal primary key (UUID)
-- - Store a human-facing display id with a repo hint prefix (e.g. HAL-0079)
--
-- Notes:
-- - This migration modifies the existing `public.tickets` table in place.
-- - It keeps the legacy `id` column (text) for backward compatibility, but it is no longer the primary key.
-- - After migration, application code should:
--   - filter tickets by `repo_full_name`
--   - use `pk` for unique identity when updating rows
--   - use `display_id` for UI and user-facing references

-- Enable gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) Add new columns (if missing)
alter table public.tickets add column if not exists pk uuid;
alter table public.tickets add column if not exists repo_full_name text;
alter table public.tickets add column if not exists ticket_number int;
alter table public.tickets add column if not exists display_id text;

-- 2) Backfill pk for existing rows
update public.tickets
set pk = gen_random_uuid()
where pk is null;

-- 3) Backfill repo + numbers for existing rows (legacy bucket)
--    Existing installs had a globally-unique 4-digit `id`; we map that into ticket_number.
update public.tickets
set
  repo_full_name = coalesce(repo_full_name, 'legacy/unknown'),
  ticket_number = coalesce(
    ticket_number,
    nullif(regexp_replace(coalesce(id, ''), '[^0-9]', '', 'g'), '')::int
  ),
  display_id = coalesce(
    display_id,
    'LEG-' || lpad(coalesce(nullif(regexp_replace(coalesce(id, ''), '[^0-9]', '', 'g'), ''), '0'), 4, '0')
  )
where repo_full_name is null or ticket_number is null or display_id is null;

-- 4) Enforce constraints
alter table public.tickets alter column pk set not null;
alter table public.tickets alter column repo_full_name set not null;
alter table public.tickets alter column ticket_number set not null;
alter table public.tickets alter column display_id set not null;

-- 5) Switch primary key to pk (drop legacy pk on id)
alter table public.tickets drop constraint if exists tickets_pkey;
alter table public.tickets add constraint tickets_pkey primary key (pk);

-- 6) Ensure per-repo uniqueness for ticket_number and display_id
alter table public.tickets
  add constraint tickets_repo_ticket_number_key unique (repo_full_name, ticket_number);

alter table public.tickets
  add constraint tickets_repo_display_id_key unique (repo_full_name, display_id);

-- 7) Helpful indexes for kanban queries
create index if not exists tickets_repo_full_name_idx on public.tickets (repo_full_name);
create index if not exists tickets_repo_col_pos_idx on public.tickets (repo_full_name, kanban_column_id, kanban_position);

-- If existing tickets were backfilled as repo_full_name = 'legacy/unknown' and they all belong to one repo,
-- run from project root: node scripts/backfill-repo-full-name.js <owner/repo>
-- e.g. node scripts/backfill-repo-full-name.js beardedphil/portfolio-2026-hal


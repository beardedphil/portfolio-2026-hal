# Decisions: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Column ID

- Used `col-wont-implement` to match existing convention (`col-unassigned`, `col-todo`, etc.).

## Migration strategy

- For existing Supabase instances with 4 columns, added a migration in connectSupabase: when kanban_columns has rows but no `col-wont-implement`, insert it with `position = max(existing positions) + 1`. This ensures existing deployments get the column on next connect without manual SQL.

## Sync scripts

- Kept hardcoded KANBAN_COLUMN_IDS in sync-tickets.js (all 3 copies) and added col-wont-implement. Alternative would be to fetch kanban_columns from DB and use those ids, but the minimal fix was to extend the existing list.

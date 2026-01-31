# Worklog: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Summary

Traced the persistence flow:
- `kanban_column_id` is stored in Supabase `tickets` table.
- On drag/drop, `updateSupabaseTicketKanban` writes the new column id.
- sync-tickets.js runs a post-sync "normalize" that resets tickets with unknown column ids to col-unassigned.
- Kanban display uses `columnIds` from `kanban_columns`; unknown column ids are remapped to first column (Unassigned).

The Will Not Implement column (`col-wont-implement`) was not in:
- KANBAN_COLUMN_IDS (sync scripts)
- DEFAULT_KANBAN_COLUMNS_SEED (Kanban App)
- EMPTY_KANBAN_COLUMNS and File System mode structures

## Changes made

1. Added `col-wont-implement` / "Will Not Implement" to DEFAULT_KANBAN_COLUMNS_SEED.
2. Added to KANBAN_COLUMN_IDS in App.tsx.
3. Added to EMPTY_KANBAN_COLUMNS in App.tsx.
4. Added to refreshTicketStore byColumn and setTicketColumns (File System mode).
5. Added migration in connectSupabase: if kanban_columns has rows but no col-wont-implement, insert it.
6. Added col-wont-implement to KANBAN_COLUMN_IDS in scripts/sync-tickets.js, projects/kanban/scripts/sync-tickets.js, projects/hal-agents/scripts/sync-tickets.js.

## Verification

- Build passes.
- Human verification: move ticket to Will Not Implement, refresh page, ticket remains in Will Not Implement.
- Run sync-tickets; ticket in Will Not Implement is not reset to Unassigned.

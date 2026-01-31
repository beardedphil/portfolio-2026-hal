# Plan: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Goal

Ensure that when a ticket is moved to **Will Not Implement**, that state persists after refreshing/reopening the embedded Kanban UI.

## Root cause

1. **Will Not Implement column was missing** from `KANBAN_COLUMN_IDS` and `DEFAULT_KANBAN_COLUMNS_SEED` in the Kanban app and sync scripts.
2. **sync-tickets.js** (root, projects/kanban, projects/hal-agents): After docs↔DB sync, it resets any ticket whose `kanban_column_id` is not in the hardcoded list to `col-unassigned`. `col-wont-implement` was not in that list.
3. **Existing Supabase instances** had only 4 columns; Will Not Implement was never seeded.

## Approach

1. **Add col-wont-implement to KANBAN_COLUMN_IDS** in `projects/kanban/src/App.tsx` (File System mode) and all three `sync-tickets.js` scripts.
2. **Add Will Not Implement to DEFAULT_KANBAN_COLUMNS_SEED** in App.tsx so new Supabase setups get the column.
3. **Add Will Not Implement to EMPTY_KANBAN_COLUMNS** and File System mode `byColumn`/`ticketColumns` in App.tsx.
4. **Migration for existing DBs**: When connecting, if `kanban_columns` has rows but lacks `col-wont-implement`, insert it.

## File touchpoints

- `projects/kanban/src/App.tsx`: DEFAULT_KANBAN_COLUMNS_SEED, KANBAN_COLUMN_IDS, EMPTY_KANBAN_COLUMNS, refreshTicketStore byColumn/ticketColumns, connectSupabase migration.
- `scripts/sync-tickets.js`: KANBAN_COLUMN_IDS.
- `projects/kanban/scripts/sync-tickets.js`: KANBAN_COLUMN_IDS.
- `projects/hal-agents/scripts/sync-tickets.js`: KANBAN_COLUMN_IDS.

# Changed files: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Modified

- `projects/kanban/src/App.tsx`:
  - Added `col-wont-implement` / "Will Not Implement" to DEFAULT_KANBAN_COLUMNS_SEED.
  - Added to KANBAN_COLUMN_IDS.
  - Added to EMPTY_KANBAN_COLUMNS.
  - Added to refreshTicketStore byColumn and setTicketColumns (File System mode).
  - Added migration in connectSupabase: if kanban_columns has rows but lacks col-wont-implement, insert it.
- `scripts/sync-tickets.js`: Added `col-wont-implement` to KANBAN_COLUMN_IDS.
- `projects/kanban/scripts/sync-tickets.js`: Added `col-wont-implement` to KANBAN_COLUMN_IDS.
- `projects/hal-agents/scripts/sync-tickets.js`: Added `col-wont-implement` to KANBAN_COLUMN_IDS.

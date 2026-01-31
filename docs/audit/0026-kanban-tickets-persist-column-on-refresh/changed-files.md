# Changed files: 0026 - Kanban tickets persist column on refresh

## Modified

- `projects/kanban/src/App.tsx`:
  - Added `REFETCH_AFTER_MOVE_MS = 1500`.
  - Supabase “drop from list into column”: optimistic `setSupabaseTickets` then `updateSupabaseTicketKanban`; on success delayed refetch, on failure immediate refetch.
  - Supabase same-column reorder: optimistic `setSupabaseTickets` (kanban_position for newOrder), then loop `updateSupabaseTicketKanban`; on success delayed refetch, on failure immediate refetch.
  - Supabase cross-column move: optimistic `setSupabaseTickets` then `updateSupabaseTicketKanban`; on success delayed refetch, on failure immediate refetch.

## Created

- `docs/tickets/0026-kanban-tickets-persist-column-on-refresh.md`
- `docs/audit/0026-kanban-tickets-persist-column-on-refresh/` (plan, worklog, changed-files, decisions, verification, pm-review).

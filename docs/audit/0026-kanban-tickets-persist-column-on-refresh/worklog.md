# Worklog: 0026 - Kanban tickets persist column on refresh

- **Rough timestamps:** single session.

- Identified cause: after each move we called `await refetchSupabaseTickets()`; refetch could return before DB write was visible, overwriting state with stale data (“last few” moves reverted).

- Added `REFETCH_AFTER_MOVE_MS = 1500` and optimistic `setSupabaseTickets` for: (1) drop from list into column, (2) same-column reorder, (3) cross-column move.

- Replaced immediate `await refetchSupabaseTickets()` after success with `setTimeout(() => refetchSupabaseTickets(), REFETCH_AFTER_MOVE_MS)`. On update failure, kept immediate `refetchSupabaseTickets()` to restore consistency.

- Created ticket 0026 and audit folder (plan, worklog, changed-files, decisions, verification, pm-review). Branch created, only kanban App.tsx + ticket + audit committed and pushed.

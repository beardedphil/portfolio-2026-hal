# Plan: 0026 - Kanban tickets persist column on refresh

## Goal

Fix Supabase-backed Kanban so that the last few moved tickets no longer revert to wrong columns after a page refresh. Root cause: immediate refetch after move could return stale data (read-after-write), overwriting local state.

## Approach

1. **Optimistic updates** — On drag-end (move or reorder), update `supabaseTickets` in React state first via `setSupabaseTickets(...)` so the UI shows the new column/position immediately.
2. **No immediate refetch** — Remove `await refetchSupabaseTickets()` right after a successful Supabase update so we never overwrite with a potentially stale read.
3. **Delayed refetch** — After a successful move, schedule a single refetch after 1.5s (`REFETCH_AFTER_MOVE_MS`) so the DB write is visible before we sync.
4. **Refetch on failure** — If the Supabase update fails, call `refetchSupabaseTickets()` to restore consistent state.

## File touchpoints

- `projects/kanban/src/App.tsx`:
  - Add constant `REFETCH_AFTER_MOVE_MS = 1500`.
  - In handleDragEnd: Supabase “drop from list into column” — optimistic `setSupabaseTickets`, then `updateSupabaseTicketKanban`; on success `setTimeout(refetchSupabaseTickets, REFETCH_AFTER_MOVE_MS)`, on failure `refetchSupabaseTickets()`.
  - In handleDragEnd: Supabase same-column reorder — optimistic `setSupabaseTickets` (update `kanban_position` for each in newOrder), then loop `updateSupabaseTicketKanban`; on success delayed refetch, on failure immediate refetch.
  - In handleDragEnd: Supabase cross-column move — optimistic `setSupabaseTickets`, then `updateSupabaseTicketKanban`; on success delayed refetch, on failure immediate refetch.

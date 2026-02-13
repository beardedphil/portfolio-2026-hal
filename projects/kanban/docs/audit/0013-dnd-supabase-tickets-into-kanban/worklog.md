# Work log (0013-dnd-supabase-tickets-into-kanban)

## Implementation
- Added `useMemo` import; `supabaseBoardActive`; derived `supabaseColumns` and `supabaseCards` from `supabaseTickets` (group by `kanban_column_id`, sort by `kanban_position`). `columnsForDisplay` / `cardsForDisplay` use them when Supabase board active.
- Hide "Add column" and column remove when `supabaseBoardActive` (in addition to `ticketStoreConnected`).
- Added `DraggableSupabaseTicketItem` (useDraggable with id = row.id); replaced Supabase ticket list `<li>` with it.
- Added `updateSupabaseTicketKanban(id, updates)` callback; added `SUPABASE_POLL_INTERVAL_MS = 10_000` and polling `useEffect` when `supabaseBoardActive`.
- In `handleDragEnd`: skip column reorder when `supabaseBoardActive`. Added branch for drag from Supabase list into column (update ticket, refetch, addLog). Added branch for Supabase move/reorder (same-column: update positions for all in column; cross-column: update one ticket; then refetch). Extended dependency array with `supabaseBoardActive`, `supabaseTickets`, `updateSupabaseTicketKanban`, `refetchSupabaseTickets`.
- Debug panel: Ticket Store (Supabase) section now shows Polling (10s / off), Last poll time, Last poll error, Per-column ticket IDs (`kanbanColumnTicketIdsDisplay`). Added hint "Drag into a column to save" in Supabase ticket list when connected.

## Commit
- Committed and pushed with ticket ID in the commit subject (e.g. `feat(0013): ...`).

## Git status when ready
- `git status -sb` (after push): `## main...origin/main`

# Plan (0013-dnd-supabase-tickets-into-kanban)

## Goal
Make Supabase-backed tickets draggable into kanban columns (and between them) so the board remains usable after the docs→Supabase migration.

## Deliverable (UI-only)
When Ticket Store is set to Supabase and connected, a human can drag a ticket from the Supabase ticket list into To-do/Doing/Done, and the ticket stays there after refresh/polling.

## Acceptance criteria (summary)
- With Ticket Store = **Supabase** and connected, the UI shows a Supabase ticket list where each ticket is draggable.
- Dragging a Supabase ticket into **To-do** creates/moves the corresponding kanban card into To-do immediately after drop.
- Dragging the same ticket **To-do → Doing** moves it and it stays there.
- Reordering two Supabase tickets within the same column persists after drop.
- The Debug panel shows: current polling interval (or "polling off"), last poll time, last poll error (or none), per-column ticket order (IDs in order).
- After a page refresh, ticket placements and ordering load from Supabase (no reliance on local docs frontmatter).

## Steps

1. **Derive Supabase board state**
   - When `ticketStoreMode === 'supabase'` and `supabaseConnectionStatus === 'connected'`, derive columns and cards from `supabaseTickets` (group by `kanban_column_id`, sort by `kanban_position`; build To-do/Doing/Done with card IDs).
   - `columnsForDisplay` / `cardsForDisplay` use this derived state when Supabase board is active; otherwise existing logic (docs or dummy).

2. **Board visibility**
   - When Supabase board is active, Columns section shows To-do/Doing/Done with tickets; hide "Add column" and column remove (same as docs mode).

3. **Draggable Supabase ticket list**
   - Add `DraggableSupabaseTicketItem` using `useDraggable` with id = ticket id; use in Supabase ticket list so each list item is draggable.

4. **handleDragEnd for Supabase**
   - **From list into column:** `!sourceColumn && supabaseBoardActive && overColumn && ticket id in supabaseTickets` → update ticket in Supabase (`kanban_column_id`, `kanban_position`, `kanban_moved_at`), then refetch.
   - **Same-column reorder:** update `kanban_position` for each affected ticket in that column (idempotent); then refetch.
   - **Cross-column move:** update one ticket's `kanban_column_id`, `kanban_position`, `kanban_moved_at`; then refetch.
   - Skip column reorder when Supabase board active (fixed To-do/Doing/Done).

5. **Supabase update helper**
   - `updateSupabaseTicketKanban(id, { kanban_column_id?, kanban_position?, kanban_moved_at? })`: single-row update; return success/fail; set `supabaseLastError` on failure.

6. **Polling**
   - When Supabase board is active, start interval (e.g. 10s) calling `refetchSupabaseTickets`; clear on unmount or when board no longer active. Constant `SUPABASE_POLL_INTERVAL_MS = 10_000`.

7. **Debug panel**
   - In Ticket Store (Supabase) section add: Polling (10s / off), Last poll time, Last poll error, Per-column ticket IDs (e.g. "To-do: 0001,0002 | Doing: 0003 | Done: (empty)").

8. **Audit**
   - Create `docs/audit/0013-dnd-supabase-tickets-into-kanban/` with plan, worklog, changed-files, decisions, verification.

## Data (existing)
- Supabase `tickets` table already has `kanban_column_id`, `kanban_position`, `kanban_moved_at` (0011/0012).
- Idempotent updates: moving a ticket updates its `kanban_column_id` and `kanban_moved_at`; reordering updates `kanban_position` for affected tickets in that column.

## Out of scope
- Docs ticket dragging in this ticket (Supabase mode only).
- Multi-project; realtime (use polling only).

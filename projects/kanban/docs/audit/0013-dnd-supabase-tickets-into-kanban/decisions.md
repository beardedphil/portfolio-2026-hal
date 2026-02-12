# Decisions (0013-dnd-supabase-tickets-into-kanban)

## Supabase board active = mode Supabase + connected
- **Decision:** When `ticketStoreMode === 'supabase'` and `supabaseConnectionStatus === 'connected'`, the board (Columns section) shows To-do/Doing/Done derived from `supabaseTickets` (kanban_column_id, kanban_position). No separate "connected" flag for Supabase board; reuse existing connection state.
- **Rationale:** Ticket: "When Ticket Store is set to Supabase" and connected. Keeps one source of truth; board reflects Supabase data when user is in Supabase mode and has connected.

## Derived columns/cards (no local state for Supabase board)
- **Decision:** `supabaseColumns` and `supabaseCards` are computed with `useMemo` from `supabaseTickets`. We do not maintain local column/card state for Supabase; after every drop we update Supabase and refetch, so `supabaseTickets` (and thus the derived board) updates.
- **Rationale:** Ticket: "the ticket stays there after refresh/polling" and "After a page refresh, the ticket placements and ordering load from Supabase." Single source of truth in DB; refetch keeps UI in sync and works after refresh.

## Polling (not realtime)
- **Decision:** When Supabase board is active, poll every 10s by calling `refetchSupabaseTickets`. No Supabase realtime subscription.
- **Rationale:** Ticket: "Use **polling** (not realtime) for updates; keep the interval modest (e.g. 5–15s)."

## Update then refetch after drop
- **Decision:** On drop (from list into column, same-column reorder, cross-column move), we call `updateSupabaseTicketKanban` (one or many rows), then `refetchSupabaseTickets()`. No optimistic local state for Supabase board.
- **Rationale:** Keeps logic simple; refetch ensures consistency and works with polling; idempotent updates as per ticket.

## Debug: polling and per-column IDs
- **Decision:** Debug panel shows "Polling: 10s" or "Polling: off", "Last poll time", "Last poll error", and "Per-column ticket IDs: To-do: 0001,0002 | Doing: 0003 | Done: (empty)" so a human can verify without external tools.
- **Rationale:** Ticket: "The Debug panel shows: current polling interval (or 'polling off'), last poll time, last poll error (or none), per-column ticket order (IDs in order) so a human can verify without external tools."

## No column reorder when Supabase board active
- **Decision:** When `supabaseBoardActive`, column reorder (drag column header) is a no-op; we do not persist column order for Supabase (fixed To-do/Doing/Done).
- **Rationale:** Ticket only requires moving tickets between the three columns and reordering within a column; column order is fixed.

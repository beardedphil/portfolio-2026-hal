# Decisions (0017-fix-supabase-dnd-drop-after-hal-connect)

## Single source of truth for Supabase URL/key
- **Decision:** When `connectSupabase(url, key)` succeeds, we set both `supabaseProjectUrl` and `supabaseAnonKey` state. `updateSupabaseTicketKanban` and `refetchSupabaseTickets` read from these; no separate credential source.
- **Rationale:** HAL postMessage and folder picker call `connectSupabase` with url/key but did not update the state that the update/refetch callbacks depend on. Setting state in connect ensures any connection path (HAL, folder picker, future flows) yields usable credentials for DnD persistence.

## Error return from updateSupabaseTicketKanban
- **Decision:** `updateSupabaseTicketKanban` returns `{ ok: true }` or `{ ok: false; error: string }` instead of `boolean`. Callers log the error on failure.
- **Rationale:** Ticket requires "a clear error message on failure (not just 'failed')". Returning the error lets the action log show the actual Supabase or network message; Debug panel already shows `supabaseLastError`, but the action log entry is more discoverable during a DnD operation.

## Success log format
- **Decision:** Success entries use "Supabase ticket \<id\> moved to \<column\>" (or "reordered in \<column\>" for same-column reorder).
- **Rationale:** Ticket acceptance: "a log entry like 'Supabase ticket \<id\> moved to \<column\>' on success."

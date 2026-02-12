# Decisions (0011-supabase-ticketstore-v0-connect-and-list)

## Ticket store mode alongside Docs
- **Decision:** Add a mode selector (Docs | Supabase) in the Ticket Store section. Docs mode preserves existing behavior; Supabase mode shows a separate config panel and ticket list.
- **Rationale:** Ticket: "The app has a Ticket Store: Supabase mode in the UI (alongside existing modes, if any)." No breaking change to Docs flow.

## Config in localStorage only
- **Decision:** Store Supabase project URL and anon key in localStorage under key `supabase-ticketstore-config`. No file on disk; nothing to add to .gitignore.
- **Rationale:** Ticket: "Supabase config is stored locally ... and is not committed to git." localStorage is local and never committed.

## Test query to detect missing table
- **Decision:** On Connect, run a minimal query `from('tickets').select('id').limit(1)` first. If error code/message indicates relation/table does not exist, set "Supabase not initialized" and show setup SQL; do not fetch full list.
- **Rationale:** Ticket: "If the Supabase schema is missing (table not created yet), the UI shows a clear in-app message ... and a Setup instructions area containing a copy/paste SQL block."

## No persistent Supabase client instance
- **Decision:** Create a Supabase client in the Connect handler only; use it for test query and full fetch, then discard. No stored client ref for later refreshes in v0.
- **Rationale:** Minimal scope; refresh can be "click Connect again" for v0. Keeps state simple.

## Ticket Viewer content = body_md
- **Decision:** When a Supabase ticket is selected, display `body_md` in the Ticket Viewer (plain text in a pre).
- **Rationale:** Ticket: "full ticket content (plain text is fine for v0)"; implementation notes suggest body_md as full markdown content.

## Supabase ticket list not draggable
- **Decision:** Supabase ticket list items are plain buttons (no useDraggable). No drag-from-Supabase-into-kanban in this ticket.
- **Rationale:** Non-goals: "No syncing Supabase tickets into kanban columns yet."

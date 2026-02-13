# Decisions (0018-show-add-column-when-project-folder-connected)

## Add column gated only by Supabase board
- **Decision:** Show "Add column" when `!supabaseBoardActive`; do not gate on `ticketStoreConnected`.
- **Rationale:** Ticket: "Ticket Store connected mode should still allow column CRUD, so the button should not be gated by ticketStoreConnected." Supabase board keeps fixed To-do/Doing/Done (no Add column).

## Display and create use same source when Ticket Store connected
- **Decision:** When `!supabaseBoardActive`, `columnsForDisplay` and `cardsForDisplay` use `ticketStoreConnected ? ticketColumns : columns` and `ticketStoreConnected ? ticketCards : cards`. `handleCreateColumn` adds to the same source (ticketColumns when connected, else columns).
- **Rationale:** So that when Ticket Store is connected, new columns appear on the board immediately and the board shows Ticket Store columns; no regression for local-only mode.

## Debug-only "Connect Ticket Store (docs)"
- **Decision:** Added a "Connect Ticket Store (docs)" button in the Debug panel (Ticket Store section) when not connected, calling the existing `_handleConnectProject`.
- **Rationale:** Ticket: "Verification must require no external tools (no terminal, no devtools, no console)." A human must be able to connect the Ticket Store from the UI to verify Add column remains visible and functional.

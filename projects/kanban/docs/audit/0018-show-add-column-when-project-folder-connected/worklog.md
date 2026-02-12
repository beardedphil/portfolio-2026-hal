# Work log (0018-show-add-column-when-project-folder-connected)

## Implementation
- **Add column visibility:** Replaced condition `!ticketStoreConnected && !supabaseBoardActive` with `!supabaseBoardActive` so "Add column" is shown whenever the Supabase board is not active (including when Ticket Store is connected).
- **Display when Ticket Store connected:** `columnsForDisplay` when `!supabaseBoardActive` now uses `ticketStoreConnected ? ticketColumns : columns`; `cardsForDisplay` uses `ticketStoreConnected ? ticketCards : cards` so the board shows Ticket Store columns/cards when connected.
- **Create column in correct state:** `handleCreateColumn` now uses `ticketStoreConnected ? ticketColumns : columns` for duplicate check and `ticketStoreConnected ? setTicketColumns : setColumns` for adding, so new columns appear on the board in both local and Ticket Store modes.
- **Debug panel:** Added "Connect Ticket Store (docs)" button in Debug → Ticket Store section when not connected, so a human can connect without terminal/devtools. Removed `_handleConnectProject` from `_retain` (now used by the button).

## Verification
- With Supabase disconnected: Add column visible; connect Ticket Store via Debug → "Connect Ticket Store (docs)" → pick folder with docs/tickets; Add column remains visible; click Add column → form; create column → new column appears on board.
- With Supabase connected: Add column hidden (unchanged). Column remove/reorder unchanged for Ticket Store and Supabase modes.

## Git status when ready
- `git status -sb` (after push): `## main...origin/main`

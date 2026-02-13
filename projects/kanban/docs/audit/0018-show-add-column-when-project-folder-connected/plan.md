# Plan (0018-show-add-column-when-project-folder-connected)

## Goal
Keep the "Add column" UI available when the docs-backed project folder (Ticket Store) is connected.

## Deliverable (UI-only)
A human can connect a project folder (Ticket Store) and still see and use "Add column" to create a column in the UI (no disappearing button).

## Acceptance criteria (summary)
- Connect a project folder (Ticket Store) in the UI.
- The **Add column** button is still visible.
- Clicking **Add column** shows the form.
- Creating a column adds it to the board immediately (visible as a new column).
- Basic smoke: existing column remove/reorder behaviors still work as before (no regressions).

## Steps

1. **Show Add column when not Supabase board**
   - Change the condition that wraps the Add column button from `!ticketStoreConnected && !supabaseBoardActive` to `!supabaseBoardActive` so the button is visible when Ticket Store is connected (Supabase board remains fixed To-do/Doing/Done, no Add column).

2. **Display and create use correct state when Ticket Store connected**
   - When `!supabaseBoardActive`: derive `columnsForDisplay` as `ticketStoreConnected ? ticketColumns : columns` (and `cardsForDisplay` as `ticketStoreConnected ? ticketCards : cards`) so the board shows Ticket Store columns when connected.
   - In `handleCreateColumn`: when `ticketStoreConnected`, add to `ticketColumns` and check duplicates against `ticketColumns`; otherwise use `columns` so new columns appear on the board in both modes.

3. **In-app verification**
   - Expose a way to connect Ticket Store from the UI (Debug panel: "Connect Ticket Store (docs)" button) so verification requires no external tools.

4. **Audit**
   - Create `docs/audit/0018-show-add-column-when-project-folder-connected/` with plan, worklog, changed-files, decisions, verification (UI-only).

## Out of scope
- Long-term persistence format for connected-mode columns (ticket non-goal).

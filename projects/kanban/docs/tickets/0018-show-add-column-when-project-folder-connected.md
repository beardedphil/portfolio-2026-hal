# Ticket

- **ID**: `0018`
- **Title**: Show “Add column” when a project folder is connected
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P1

## Linkage (for tracking)

- **Fixes**: `0010`
- **Category**: `State`

## Goal (one sentence)

Keep the “Add column” UI available when the docs-backed project folder (Ticket Store) is connected.

## Human-verifiable deliverable (UI-only)

A human can connect a project folder and still see and use “Add column” to create a column in the UI (no disappearing button).

## Acceptance criteria (UI-only)

- [ ] Connect a project folder (Ticket Store) in the UI.
- [ ] The **Add column** button is still visible.
- [ ] Clicking **Add column** shows the form.
- [ ] Creating a column adds it to the board immediately (visible as a new column).
- [ ] Basic smoke: existing column remove/reorder behaviors still work as before (no regressions).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Deciding long-term persistence format for connected-mode columns (this ticket is about the disappearing UI and basic functionality)

## Implementation notes (optional)

- Current behavior likely hides the button via a condition like `!ticketStoreConnected && !supabaseBoardActive`.
- Supabase board can keep columns fixed; Ticket Store connected mode should still allow column CRUD, so the button should not be gated by `ticketStoreConnected`.

## Audit artifacts required (implementation agent)

Create `docs/audit/0018-show-add-column-when-project-folder-connected/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

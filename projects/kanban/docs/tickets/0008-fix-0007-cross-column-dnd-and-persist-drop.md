## Ticket

- **ID**: `0008`
- **Title**: Fix 0007 — card drops persist + cross-column moves work
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0007`
- **Category**: DnD

## Goal (one sentence)

Make card drag-and-drop actually update state: reorders should persist, and cards must move between columns.

## QA failure summary

- Dragging a card within its column appears to work, but the order **reverts immediately** after drop.
- Dragging a card from one column to another **does not work at all**.

## Human-verifiable deliverable (UI-only)

A human can drag a dummy card within a column and see the new order persist, and can drag a dummy card into a different column and see it stay there.

## Acceptance criteria (UI-only)

- [ ] With default columns visible, drag a card within **To-do** to a new position and drop → the new order **persists** (no instant revert).
- [ ] Drag a card from **To-do** into **Doing** and drop → the card is now visible in Doing and no longer in To-do.
- [ ] Drag a card from **Doing** into **Done** and drop → it moves and stays there.
- [ ] The Debug panel’s Kanban state shows per-column card order, and it updates immediately after each drop (so a human can verify without external tools).
- [ ] The Action Log records one entry per successful drop:
  - reorder within column (include column name + before/after order)
  - move across columns (include from/to column + before/after orders)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No real card creation/editing yet.
- No persistence yet.
- No styling changes unless needed to make DnD usable (must be documented if changed).

## Implementation notes (optional)

- Suspected cause of “revert”: card order might be derived from constants or props instead of state, or the DnD `onDragEnd` updates the wrong state shape.
- Cross-column moves require multiple containers; ensure both draggable items and column droppables participate in the same DnD context.

## Audit artifacts required (implementation agent)

Create `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

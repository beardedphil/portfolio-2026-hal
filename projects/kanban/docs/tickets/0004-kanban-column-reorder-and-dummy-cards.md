## Ticket

- **ID**: `0004`
- **Title**: Kanban v0 — reorder columns + show dummy cards
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Allow a human to reorder columns via drag-and-drop and display dummy ticket cards for spacing/layout work.

## Human-verifiable deliverable (UI-only)

In the running app, a human can drag a column left/right to reorder it and can see multiple dummy ticket cards rendered inside each column with consistent spacing.

## Acceptance criteria (UI-only)

- [ ] Each column can be dragged to reorder; after dropping, the columns appear in the new order immediately.
- [ ] Each column displays at least **3 dummy ticket cards** (static data is fine) with readable spacing (card backgrounds/borders ok, minimal styling).
- [ ] The Debug panel’s **Kanban state** includes the **current column order** (e.g., “Column order: A → B → C”) so a human can confirm order changes without external tools.
- [ ] The Action Log records a clear entry when a reorder occurs (e.g., `Columns reordered: A,B,C -> B,A,C`).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No real ticket creation/editing yet.
- No dragging cards between columns yet (columns only).
- No persistence yet.

## Implementation notes (optional)

- Prefer a well-maintained drag-and-drop approach (e.g. `@dnd-kit/*`) rather than ad-hoc mouse handlers.
- Keep the implementation minimal and easy to extend later for card drag-and-drop.

## Audit artifacts required (implementation agent)

Create `docs/audit/0004-kanban-column-reorder-and-dummy-cards/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

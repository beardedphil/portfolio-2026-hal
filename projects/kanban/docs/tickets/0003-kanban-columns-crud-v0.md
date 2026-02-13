---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-01-30T19:39:21.023Z
---
## Ticket

- **ID**: `0003`
- **Title**: Kanban v0 — add/remove columns (no tickets yet)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Let a human add and remove kanban columns in the UI.

## Human-verifiable deliverable (UI-only)

In the running app, a human can add a column with a name, see it appear immediately, and remove it with a visible control.

## Acceptance criteria (UI-only)

- [ ] The page shows a **Columns** section with an **Add column** button.
- [ ] Clicking **Add column** reveals a small UI-only form (at minimum: a text input + Create/Cancel).
- [ ] Creating a column adds a visible column card with the entered name.
- [ ] Each column has a **Remove** button; clicking it removes that column from the UI immediately.
- [ ] The Debug panel shows a readable summary of current kanban state, including **column count** and a list of **column names** (so verification needs no counting tools).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No tickets/cards yet.
- No drag-and-drop yet.
- No persistence yet (unless it’s required to keep UI verification sane).
- No styling polish beyond readable layout.

## Implementation notes (optional)

- Use simple React state (e.g. `useState`) for columns.
- Column shape suggestion: `{ id: string; title: string }` with stable unique ids.
- Keep the UI minimal: a horizontal row of columns is fine.

## Audit artifacts required (implementation agent)

Create `docs/audit/0003-kanban-columns-crud-v0/` containing:
- `plan.md`
- `worklog.md` (must include pushed commit hash)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

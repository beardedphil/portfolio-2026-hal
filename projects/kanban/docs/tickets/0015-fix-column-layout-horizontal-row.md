## Ticket

- **ID**: `0015`
- **Title**: Fix kanban column layout — render columns in a single horizontal row
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0014`
- **Category**: CSS

## Goal (one sentence)

Restore the kanban board so columns render side-by-side in one row (not stacked vertically).

## Human-verifiable deliverable (UI-only)

On the main board, To-do/Doing/Done appear on the same horizontal row (scrolling horizontally if needed), with cards inside each column.

## Acceptance criteria (UI-only)

- [ ] With Project = `hal-kanban`, the board shows **To-do**, **Doing**, **Done** laid out horizontally on one row (not vertical stack).
- [ ] If the window is narrow, columns remain side-by-side and the board can scroll horizontally (or otherwise clearly remains “row-based”).
- [ ] Drag-and-drop still works for moving cards between columns after the layout fix.
- [ ] Debug panel still shows per-column ticket IDs and polling info (no regressions).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- No unrelated styling/polish beyond restoring the intended layout.

## Implementation notes (optional)

- Likely fix is in `src/index.css` around the container for columns (e.g. `.columns-row`):
  - ensure `display: flex` and `flex-direction: row`
  - ensure no parent container is forcing column stacking
  - consider `overflow-x: auto` on the columns row for small screens

## Audit artifacts required (implementation agent)

Create `docs/audit/0015-fix-column-layout-horizontal-row/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

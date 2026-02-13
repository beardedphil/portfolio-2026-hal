# Plan (0015-fix-column-layout-horizontal-row)

## Goal
Restore the kanban board so columns render side-by-side in one row (not stacked vertically).

## Deliverable (UI-only)
On the main board, To-do/Doing/Done appear on the same horizontal row (scrolling horizontally if needed), with cards inside each column.

## Acceptance criteria (summary)
- With Project = `hal-kanban`, the board shows **To-do**, **Doing**, **Done** laid out horizontally on one row (not vertical stack).
- If the window is narrow, columns remain side-by-side and the board can scroll horizontally (or otherwise clearly remains "row-based").
- Drag-and-drop still works for moving cards between columns after the layout fix.
- Debug panel still shows per-column ticket IDs and polling info (no regressions).

## Steps

1. **Identify cause**
   - Inspect `src/index.css` and `.columns-row` / `.columns-section`; confirm parent/container rules. Root cause was `flex-wrap: wrap` on `.columns-row` causing columns to wrap to the next line.

2. **Fix `.columns-row`**
   - Set `flex-direction: row` (explicit).
   - Set `flex-wrap: nowrap` so columns never wrap to a new line.
   - Add `overflow-x: auto` so the row scrolls horizontally on small screens.

3. **Verify**
   - No parent changes required; `#root` max-width does not need to change for this ticket (columns row scrolls within available width).

4. **Audit**
   - Create `docs/audit/0015-fix-column-layout-horizontal-row/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Changing `#root` max-width or overall page layout.
- Any styling polish beyond restoring horizontal row layout.

# Plan (0016-widen-board-remove-columns-heading)

## Goal
Make the kanban board use the available width (so multiple columns fit) and remove the redundant "Columns" title.

## Deliverable (UI-only)
On the main screen, the board is no longer constrained to a narrow centered column; columns have enough horizontal space to show at least 4 columns comfortably, and the "Columns" heading is not shown.

## Acceptance criteria (summary)
- Page content no longer constrained to a narrow middle strip; board uses most of the viewport width (reasonable margins fine).
- With Project = hal-kanban, the visible board can show at least 4 columns worth of space without feeling cramped (horizontal scroll on very small screens is acceptable).
- The "Columns" heading/title is removed; board still renders columns and cards normally.
- Drag-and-drop and Debug panel continue to work (no regression).

## Steps

1. **Widen the board**
   - In `src/index.css`, remove or relax `#root { max-width: 640px; margin: 0 auto; }` so the app container uses most of the viewport width. Remove `max-width` and `margin: 0 auto` so content spans full width with existing padding.

2. **Remove "Columns" heading**
   - In `src/App.tsx`, remove the `<h2>Columns</h2>` inside the board section (`.columns-section`). Keep the section and `aria-label="Columns"` for accessibility.
   - In `src/index.css`, remove the `.columns-section h2` rule (no longer used).

3. **Verify**
   - Load app with Project = hal-kanban; confirm board uses full width and at least 4 columns fit comfortably; confirm no "Columns" heading; confirm DnD and Debug panel unchanged.

4. **Audit**
   - Create `docs/audit/0016-widen-board-remove-columns-heading/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- No unrelated redesign; only spacing/layout and removing the heading.

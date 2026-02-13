# Work log (0015-fix-column-layout-horizontal-row)

## Implementation
- Updated `src/index.css`: `.columns-row` — set `flex-direction: row`, `flex-wrap: nowrap`, and `overflow-x: auto`. Removed `flex-wrap: wrap` that caused columns to stack vertically when space was limited.

## Verification
- With Project = hal-kanban: board shows To-do, Doing, Done in one horizontal row; narrow window shows horizontal scroll on the columns row; DnD and Debug panel unchanged (manual check).

## Git status when ready
- `git status -sb` (after push): `## main...origin/main`

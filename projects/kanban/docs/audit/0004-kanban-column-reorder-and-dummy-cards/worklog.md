# Worklog (0004-kanban-column-reorder-and-dummy-cards)

## 1. Dependencies
- Installed `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## 2. Column drag-and-drop
- Added `DndContext`, `SortableContext` wrapping the columns row.
- Created `SortableColumn` component with `useSortable`, `horizontalListSortingStrategy`.
- Drag listeners on column title span; Remove button kept separate.
- `handleColumnDragEnd`: uses `arrayMove` to reorder columns; logs "Columns reordered: old -> new" to Action Log.
- Sensors: PointerSensor (activationConstraint distance 8), KeyboardSensor (sortableKeyboardCoordinates).

## 3. Dummy cards
- Added `DUMMY_CARDS` constant (3 items: Dummy task A, B, C).
- Rendered 3 dummy cards per column in `.column-cards` container with `.ticket-card` class.

## 4. Debug panel — Column order
- Added "Column order: A → B → C" to Kanban state section (or "(none)" when empty).

## 5. Action Log — Reorder
- On column drag end, addLog with format "Columns reordered: A,B,C -> B,A,C".

## 6. CSS
- Added `.column-header`, `.column-cards`, `.ticket-card`; column title cursor grab/grabbing; column min-width 180px.

## 7. Audit artifacts
- Created `docs/audit/0004-kanban-column-reorder-and-dummy-cards/` with plan, worklog, changed-files, decisions, verification.

## Commit and push
- Pushed commit: `2e99c3e`
- `git status -sb`: `## main...origin/main`

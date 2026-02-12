# Plan (0004-kanban-column-reorder-and-dummy-cards)

## Goal
Allow a human to reorder columns via drag-and-drop and display dummy ticket cards for spacing/layout work.

## Steps

1. **Install @dnd-kit**
   - Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` per ticket implementation notes.

2. **Column drag-and-drop**
   - Wrap columns row in `DndContext` and `SortableContext` with `horizontalListSortingStrategy`.
   - Create `SortableColumn` component using `useSortable` hook; apply drag listeners to column title.
   - Implement `handleColumnDragEnd`: use `arrayMove` to reorder columns state; log reorder to Action Log.
   - Use `PointerSensor` with `activationConstraint: { distance: 8 }` so Remove button clicks don't trigger drag.

3. **Dummy cards**
   - Add static `DUMMY_CARDS` array (3 items: Dummy task A, B, C).
   - Render 3 dummy cards inside each column in a `.column-cards` container with `.ticket-card` styling.

4. **Debug panel — Column order**
   - Add "Column order: A → B → C" (or "(none)") to Kanban state section.

5. **Action Log — Reorder entry**
   - On reorder: `addLog(\`Columns reordered: ${oldOrder} -> ${newOrder}\`)` with comma-separated titles.

6. **Styling**
   - Add `.column-header`, `.column-cards`, `.ticket-card` styles; cursor grab on column title.

7. **Audit artifacts**
   - Create `docs/audit/0004-kanban-column-reorder-and-dummy-cards/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Real ticket creation/editing, dragging cards between columns, persistence.

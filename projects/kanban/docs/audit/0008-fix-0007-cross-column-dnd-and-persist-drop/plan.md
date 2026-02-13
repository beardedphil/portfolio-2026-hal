# Plan (0008-fix-0007-cross-column-dnd-and-persist-drop)

## Goal
Make card drag-and-drop actually update state: reorders persist, and cards move between columns.

## Root cause (from ticket)
- Same-column reorder: order reverts after drop (likely `over` is column droppable, so overIndex = -1 and logic fails).
- Cross-column move: state was updated in `onDragOver`, so by `onDragEnd` the card was already in the target column; handler treated it as same-column and did wrong/no update.

## Steps

1. **Stop updating state in onDragOver**
   - Remove the `setColumns` call from `handleDragOver` so that column state is only updated on drop.
   - Remove `recentlyMovedToNewContainer` ref and the `useEffect` that resets it.
   - Result: when `handleDragEnd` runs, `findColumnByCardId(active.id)` returns the real source column, so cross-column move applies correctly.

2. **Same-column drop when over = column**
   - In `handleDragEnd`, when resolving `overIndex` for same-column: if `overColumn.cardIds.indexOf(String(overId))` is -1 (user dropped on column droppable, not a card), set `overIndex = overColumn.cardIds.length` so the card is placed at end.
   - Ensures same-column reorder persists instead of reverting.

3. **Action log**
   - Reorder: already includes column name + before/after order; keep as-is.
   - Move: add before/after orders for both columns per acceptance criteria (from/to column + before/after orders).

4. **Cleanup**
   - Remove unused `useEffect` and `DragOverEvent` imports.

5. **Audit artifacts**
   - Create `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- No real card creation/editing; no persistence; no styling changes unless needed for DnD.

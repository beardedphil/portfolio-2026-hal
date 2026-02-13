# Plan (0007-dnd-dummy-cards-and-default-columns)

## Goal
Start the board with three default columns (To-do, Doing, Done) and allow dummy cards to be dragged within and between columns.

## Steps

1. **Default columns and cards**
   - Initialize board with exactly 3 columns: To-do, Doing, Done (stable IDs: col-todo, col-doing, col-done).
   - Create 9 dummy cards (3 per column) with unique ids (c-1..c-9) and titles Card A..I; store in columns as `cardIds` and in a `cards` map.

2. **Data model**
   - Extend `Column` to `{ id, title, cardIds: string[] }`.
   - Add `cards: Record<string, { id, title }>` (read-only for this ticket).
   - Remove global DUMMY_CARDS; render cards from column.cardIds + cards lookup.

3. **Card DnD**
   - Use existing DndContext; add `useDroppable` (from @dnd-kit/core) on each column’s card list so drops on empty area target the column.
   - Make each card `useSortable` with `data: { type: 'card', columnId }`; keep one SortableContext per column (verticalListSortingStrategy) for cards.
   - Custom collision detection so pointer/rect resolves to column or card; use lastOverId ref when layout shifts during cross-column drag.
   - Implement `onDragOver`: when dragging a card over another column, move card into that column at the correct index (using over card or column id).
   - Implement `onDragEnd`: if active is column id → existing column reorder; if active is card → finalize reorder (same column) or move (different column), then log.

4. **Debug panel**
   - Keep "Column order: …".
   - Add "Cards per column: To-do: A,B,C | Doing: … | Done: …" (card titles in order per column).

5. **Action log**
   - Card reorder within column: e.g. "Card reordered in To-do: A,B,C -> A,C,B (card: Card B)".
   - Card move between columns: e.g. "Card moved from To-do (pos 1) to Doing (pos 2): Card A" (include old location/order and new location/order).

6. **Audit artifacts**
   - Create `docs/audit/0007-dnd-dummy-cards-and-default-columns/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Real card creation; persistence; swimlanes, labels, due dates.

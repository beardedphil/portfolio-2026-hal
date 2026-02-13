# Worklog (0007-dnd-dummy-cards-and-default-columns)

## 1. Default columns and cards
- Defined `DEFAULT_COLUMNS`: To-do, Doing, Done with stable ids (`col-todo`, `col-doing`, `col-done`) and `cardIds` (c-1..c-9, 3 per column).
- Defined `INITIAL_CARDS`: 9 cards (Card A..I). Initialized `columns` and `cards` state from these.

## 2. Data model
- Extended `Column` to `{ id, title, cardIds: string[] }`. Removed global `DUMMY_CARDS`. SortableColumn now receives `col` and `cards`; renders cards from `col.cardIds` via lookup in `cards`.

## 3. Card DnD
- Imported `useDroppable` from `@dnd-kit/core`. Each column’s card list uses `useDroppable({ id: col.id })` and gets `.column-cards-over` when `isOver`.
- Added `SortableCard` with `useSortable` (id, data: { type: 'card', columnId }); each column wraps its cards in `SortableContext` with `verticalListSortingStrategy`.
- Implemented custom `collisionDetection`: pointer/rect → resolve column or closest card in column; use `lastOverId` ref when over becomes null. Typed as `CollisionDetection`.
- Implemented `handleDragOver`: when dragging card over another column, move card between column arrays (compute index from over card or append); set `recentlyMovedToNewContainer`.
- Implemented `handleDragEnd`: if active is column → existing column reorder + log; if active is card → same-column reorder via arrayMove + log "Card reordered in …"; else move card to target column + log "Card moved from … (pos …) to … (pos …)".

## 4. Debug panel
- Replaced "Column names" with "Cards per column: {To-do: … | Doing: … | Done: …}" (card titles in order per column). Kept "Column order".

## 5. Action log
- Reorder: "Card reordered in {colTitle}: {oldOrder} -> {newOrder} (card: {title})".
- Move: "Card moved from {fromTitle} (pos {fromPos}) to {toTitle} (pos {toPos}): {title}".

## 6. CSS
- `index.css`: `.column-cards` min-height; `.column-cards-over` background for droppable highlight.

## 7. Verification
- Build passes. First load shows To-do, Doing, Done with 3 cards each. Debug panel shows column order and cards per column. DnD requires manual pointer drag (in-app verification only).

## Commit and push
- Commits: `2cd6f1e` (feat), `bf2ae58` (worklog hash).
- `git status -sb` (when ready): `## main...origin/main`

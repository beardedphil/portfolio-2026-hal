# Decisions (0007-dnd-dummy-cards-and-default-columns)

## Default columns on first load
- **Decision:** Initialize `columns` state with `DEFAULT_COLUMNS`: three columns (To-do, Doing, Done) with stable ids and 3 card ids each; no "empty board" state.
- **Reason:** Ticket: "On first load, the board shows To-do, Doing, Done" without user creating columns.

## Per-column card order
- **Decision:** Store card order as `cardIds: string[]` on each column; card payloads in a single `cards: Record<string, Card>` (id + title).
- **Reason:** Minimal model for dummy cards; supports reorder and move; single source of truth for card titles.

## One DndContext for columns and cards
- **Decision:** Keep a single DndContext; distinguish column vs card drag by checking whether `active.id` is a column id (isColumnId(active.id)).
- **Reason:** Column reorder and card move/reorder in one place; avoids nested context issues.

## useDroppable on column card list
- **Decision:** Each column’s card list div is a droppable with `id: col.id`, so dropping on empty column area targets that column.
- **Reason:** Enables "drop at end of column"; @dnd-kit multi-container pattern.

## onDragOver for live card move
- **Decision:** Update columns state in onDragOver when a card is dragged over another column (move card between column arrays, compute index from over card or append).
- **Reason:** Smooth visual feedback; onDragEnd then only finalizes (and logs) same-column reorder or no-op when already moved.

## Custom collision detection
- **Decision:** Prefer pointer/rect intersections; when over a column, resolve to closest card in that column if any; cache lastOverId and return it when over becomes null during layout shift.
- **Reason:** Avoids flicker when moving cards between columns (dnd-kit multi-container pattern).

## Debug: cards per column format
- **Decision:** Show "To-do: Card A,Card B,Card C | Doing: … | Done: …" in Kanban state.
- **Reason:** Ticket: "per-column list of card titles in order" so a human can verify moves in-app.

## Action log wording
- **Decision:** Reorder: "Card reordered in {col}: {oldOrder} -> {newOrder} (card: {title})". Move: "Card moved from {fromCol} (pos {fromPos}) to {toCol} (pos {toPos}): {title}".
- **Reason:** Ticket: "old location/order and new location/order" in the message.

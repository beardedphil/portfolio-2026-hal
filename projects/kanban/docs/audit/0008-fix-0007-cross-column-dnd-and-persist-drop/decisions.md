# Decisions (0008-fix-0007-cross-column-dnd-and-persist-drop)

## Update state only on drop
- **Decision:** Do not update `columns` state in `onDragOver`; update only in `onDragEnd`.
- **Reason:** When we updated in `onDragOver`, by the time `onDragEnd` ran the card was already in the target column in state. `findColumnByCardId(active.id)` then returned the target column, so the handler treated the drop as same-column and did a reorder (or no-op) instead of a cross-column move. Updating only on drop keeps the source column correct and makes cross-column moves persist.

## Normalize overIndex when drop target is column
- **Decision:** In `handleDragEnd`, when computing `overIndex` for cards, if `overColumn.cardIds.indexOf(String(overId))` is -1 (user dropped on the column droppable, not on a card), set `overIndex = overColumn.cardIds.length`.
- **Reason:** Dropping on empty column area gives `over.id` as the column id; indexOf returns -1. Using -1 with `arrayMove` or insert index leads to wrong position or revert. Using length places the card at the end and persists.

## Remove recent-move ref and effect
- **Decision:** Remove `recentlyMovedToNewContainer` ref and the `useEffect` that reset it, and simplify collision detection so it no longer references that ref.
- **Reason:** That logic existed to stabilize "over" when state was updated during drag. With state updates only on drop, it is unnecessary.

## Move log: include before/after orders
- **Decision:** For cross-column move, log message includes from/to column and before/after orders for both columns, e.g. `Card moved from To-do [A,B,C] to Doing [D,E,F]; after: To-do [B,C], Doing [D,E,F,A] (Card A)`.
- **Reason:** Acceptance criteria require "from/to column + before/after orders" for move entries.

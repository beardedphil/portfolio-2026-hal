# Worklog (0008-fix-0007-cross-column-dnd-and-persist-drop)

## 1. Root cause
- **Same-column revert:** When dropping on the column droppable (empty area), `over.id` is the column id; `overColumn.cardIds.indexOf(overId)` is -1. Logic used -1 as overIndex, leading to wrong position or no persist.
- **Cross-column no-op:** State was updated in `handleDragOver`, so by `handleDragEnd` the card was already in the target column; `findColumnByCardId(active.id)` returned the target column, so the handler treated it as same-column.

## 2. State only on drop
- Removed the `setColumns` call from `handleDragOver`; replaced handler body with a no-op (state updates only in `handleDragEnd`).
- Removed `recentlyMovedToNewContainer` ref and the `useEffect` that reset it.
- Simplified collision detection: removed the branch that used `recentlyMovedToNewContainer.current`; now only returns `lastOverId.current` when no intersection.

## 3. Same-column and cross-column index
- In `handleDragEnd`, for both same-column and cross-column: compute `overIndex = overColumn.cardIds.indexOf(String(overId))`; if `< 0`, set `overIndex = overColumn.cardIds.length` so drop on column area places card at end and reorder persists.

## 4. Action log
- Reorder: unchanged (column name + before/after order).
- Move: now includes from/to column and before/after orders for both columns, e.g. `Card moved from To-do [A,B,C] to Doing [D,E,F]; after: To-do [B,C], Doing [D,E,F,A] (Card A)`.

## 5. Cleanup
- Removed unused `useEffect` and `DragOverEvent` imports.

## 6. Verification
- Build passes. Manual verification: reorder within column persists; drag from To-do to Doing and Doing to Done moves cards and they stay; Debug Kanban state and Action log update after each drop.

## Commit and push
- Commit: `99c2b80` (fix(0008): persist card reorder and cross-column move; update state only on drop).
- `git status -sb` (when ready): `## main...origin/main [ahead 1]` with optional ` M docs/audit/0007-dnd-dummy-cards-and-default-columns/worklog.md` and `?? nul`.

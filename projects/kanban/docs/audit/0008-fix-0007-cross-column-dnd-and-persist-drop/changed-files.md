# Changed files (0008-fix-0007-cross-column-dnd-and-persist-drop)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Removed state update from `handleDragOver` (state updates only in `handleDragEnd`). Removed `recentlyMovedToNewContainer` ref and `useEffect`. In `handleDragEnd`: same-column — normalize `overIndex` when drop target is column (use `cardIds.length`); cross-column — same normalization; move log now includes before/after orders for both columns. Removed unused `useEffect` and `DragOverEvent` imports. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/plan.md` | Implementation plan |
| `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/worklog.md` | Work log |
| `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/changed-files.md` | This file |
| `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/decisions.md` | Design/tech decisions |
| `docs/audit/0008-fix-0007-cross-column-dnd-and-persist-drop/verification.md` | UI-only verification steps |

## Unchanged
- `src/index.css`, `index.html`, `src/main.tsx`, `package.json`, etc.

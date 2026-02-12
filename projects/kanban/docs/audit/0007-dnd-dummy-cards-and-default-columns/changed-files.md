# Changed files (0007-dnd-dummy-cards-and-default-columns)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Default columns (To-do, Doing, Done) with cardIds; cards map; SortableCard + useDroppable per column; onDragOver/onDragEnd for card move/reorder; custom collision detection; Debug "Cards per column"; Action log messages for card reorder and card move. |
| `src/index.css` | `.column-cards` min-height; `.column-cards-over` for droppable highlight. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0007-dnd-dummy-cards-and-default-columns/plan.md` | Implementation plan |
| `docs/audit/0007-dnd-dummy-cards-and-default-columns/worklog.md` | Work log |
| `docs/audit/0007-dnd-dummy-cards-and-default-columns/changed-files.md` | This file |
| `docs/audit/0007-dnd-dummy-cards-and-default-columns/decisions.md` | Design/tech decisions |
| `docs/audit/0007-dnd-dummy-cards-and-default-columns/verification.md` | UI-only verification steps |

## Unchanged
- `index.html`, `src/main.tsx`, `package.json`, etc.

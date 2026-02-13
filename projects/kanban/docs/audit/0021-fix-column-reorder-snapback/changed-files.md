# Changed files (0021-fix-column-reorder-snapback)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | In `handleDragEnd`, column reorder branch: resolve drop target to column id (over may be card id); use functional update `setCols((prev) => ...)`; add skip log when over target cannot be resolved. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0021-fix-column-reorder-snapback/plan.md` | Implementation plan |
| `docs/audit/0021-fix-column-reorder-snapback/worklog.md` | Work log |
| `docs/audit/0021-fix-column-reorder-snapback/changed-files.md` | This file |
| `docs/audit/0021-fix-column-reorder-snapback/decisions.md` | Design/tech decisions |
| `docs/audit/0021-fix-column-reorder-snapback/verification.md` | UI-only verification steps |

## Unchanged
- No other source files modified. Card DnD, Supabase column handling, ticket store refresh logic unchanged.

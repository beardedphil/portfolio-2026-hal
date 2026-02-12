# Changed files (0002-fix-debug-toggle-duplicate-action-log)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | `toggleDebug`: log moved out of `setDebugOpen` updater; compute `next = !debugOpen`, call `setDebugOpen(next)` then `addLog(...)` once. Added `debugOpen` to `useCallback` deps. Action Log section: added "Total actions: N" (`<p className="action-log-summary">`) above the list. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0002-fix-debug-toggle-duplicate-action-log/plan.md` | Implementation plan |
| `docs/audit/0002-fix-debug-toggle-duplicate-action-log/worklog.md` | Work log |
| `docs/audit/0002-fix-debug-toggle-duplicate-action-log/changed-files.md` | This file |
| `docs/audit/0002-fix-debug-toggle-duplicate-action-log/decisions.md` | Design/tech decisions |
| `docs/audit/0002-fix-debug-toggle-duplicate-action-log/verification.md` | UI-only verification steps |

## Unchanged
- `src/main.tsx` (StrictMode left as-is).
- No new CSS required; optional styling for `.action-log-summary` can be added later.

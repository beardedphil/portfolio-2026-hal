# Changed files (0016-widen-board-remove-columns-heading)

## Modified

| Path | Change |
|------|--------|
| `src/index.css` | `#root`: removed `max-width: 640px` and `margin: 0 auto`. Removed `.columns-section h2` rule. |
| `src/App.tsx` | Removed `<h2>Columns</h2>` from the board section (inside `.columns-section`). |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0016-widen-board-remove-columns-heading/plan.md` | Implementation plan |
| `docs/audit/0016-widen-board-remove-columns-heading/worklog.md` | Work log |
| `docs/audit/0016-widen-board-remove-columns-heading/changed-files.md` | This file |
| `docs/audit/0016-widen-board-remove-columns-heading/decisions.md` | Design/tech decisions |
| `docs/audit/0016-widen-board-remove-columns-heading/verification.md` | UI-only verification steps |

## Unchanged
- index.html, main.tsx, frontmatter.ts, vite.config.ts, tsconfig.*, .env, package.json. No logic changes; layout and heading only.

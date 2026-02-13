# Changed files (0006-fix-add-column-button-styling)

## Modified

| Path | Change |
|------|--------|
| `src/index.css` | Added `.add-column-btn:focus` (outline: none, -webkit-tap-highlight-color: transparent) and `.add-column-btn:focus-visible` (outline 2px solid rgba(255,255,255,0.8), outline-offset 2px) to remove browser default focus/tap styling and provide a single, consistent focus indicator. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0006-fix-add-column-button-styling/plan.md` | Implementation plan |
| `docs/audit/0006-fix-add-column-button-styling/worklog.md` | Work log |
| `docs/audit/0006-fix-add-column-button-styling/changed-files.md` | This file |
| `docs/audit/0006-fix-add-column-button-styling/decisions.md` | Design/tech decisions |
| `docs/audit/0006-fix-add-column-button-styling/verification.md` | UI-only verification steps |

## Unchanged
- `src/App.tsx` — Add column button DOM already valid (single button, no nested controls).
- `index.html`, `src/main.tsx`, etc.

# Changed files (0005-prevent-duplicate-column-titles)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Added `normalizeTitle()`. State: `addColumnError`. In `handleCreateColumn`: duplicate check (normalized vs existing); on duplicate: set error, log `Column add blocked (duplicate): "…"`, return without adding or closing form. Clear error on open form, on input change, on cancel. Form: inline error `<p id="add-column-error" role="alert">`; input `aria-invalid`, `aria-describedby`. |
| `src/index.css` | Added `.add-column-error` (margin, font-size, color #c00). |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0005-prevent-duplicate-column-titles/plan.md` | Implementation plan |
| `docs/audit/0005-prevent-duplicate-column-titles/worklog.md` | Work log |
| `docs/audit/0005-prevent-duplicate-column-titles/changed-files.md` | This file |
| `docs/audit/0005-prevent-duplicate-column-titles/decisions.md` | Design/tech decisions |
| `docs/audit/0005-prevent-duplicate-column-titles/verification.md` | UI-only verification steps |

## Unchanged
- `src/main.tsx`, `index.html`, `vite.config.ts`, `package.json`, etc.

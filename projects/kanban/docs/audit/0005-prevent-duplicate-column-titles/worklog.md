# Worklog (0005-prevent-duplicate-column-titles)

## 1. Normalization
- Added `normalizeTitle(title): string` = `title.trim().toLowerCase()` for duplicate comparison.

## 2. Duplicate check and block
- In `handleCreateColumn`: after trimming, compute normalized title; `columns.some(c => normalizeTitle(c.title) === normalized)`.
- If duplicate: set `addColumnError('Column title must be unique.')`, `addLog(\`Column add blocked (duplicate): "${normalized}"\`)`, return (no column add, form stays open).

## 3. Inline error state and UI
- Added `addColumnError` state (string | null). Cleared when: opening add-column form, changing input, cancelling.
- In add-column form: conditional `<p id="add-column-error" className="add-column-error" role="alert">` with message. Input: `aria-invalid`, `aria-describedby` for accessibility.

## 4. Styling
- Added `.add-column-error` in `index.css` (margin, font-size 0.875rem, color #c00).

## 5. Audit artifacts
- Created `docs/audit/0005-prevent-duplicate-column-titles/` with plan, worklog, changed-files, decisions, verification.

## Commit and push
- Pushed commits: `c62fc8d` (feat), `c3a1c5c` (worklog).
- `git status -sb`: `## main...origin/main`

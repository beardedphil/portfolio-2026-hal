# Plan (0005-prevent-duplicate-column-titles)

## Goal
Disallow creating a new column whose title duplicates an existing column title (case-insensitive, after trimming). Block creation and show a clear in-app message; keep the form open so the user can edit.

## Steps

1. **Normalization**
   - Add `normalizeTitle(title) = title.trim().toLowerCase()` for comparison.

2. **Duplicate check in handleCreateColumn**
   - Before adding a column: normalize the new title and check if any existing column has the same normalized title.
   - If duplicate: do not add column, do not close form; set inline error state; add Action Log entry `Column add blocked (duplicate): "normalized"`.

3. **Inline error state and UI**
   - Add `addColumnError` state (string | null).
   - When duplicate is detected: set message to "Column title must be unique." and render it in the add-column form (e.g. `<p role="alert">`).
   - Clear error when: opening the form, typing in the input, or cancelling.

4. **Accessibility**
   - Input: `aria-invalid={!!addColumnError}`, `aria-describedby` pointing to error element when present.
   - Error element: `id="add-column-error"`, `role="alert"`.

5. **Styling**
   - Add `.add-column-error` style (e.g. red text, small margin) so the message is visible.

6. **Audit artifacts**
   - Create `docs/audit/0005-prevent-duplicate-column-titles/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Persistence; column renaming.

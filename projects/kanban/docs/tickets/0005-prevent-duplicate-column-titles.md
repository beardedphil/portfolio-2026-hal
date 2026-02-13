## Ticket

- **ID**: `0005`
- **Title**: Prevent duplicate column titles (case-insensitive)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Goal (one sentence)

Disallow creating a new column whose title duplicates an existing column title (case-insensitive, after trimming).

## Human-verifiable deliverable (UI-only)

When a human tries to create a column with a duplicate name, the app blocks it and shows a clear in-app message explaining why, without changing the existing columns.

## Acceptance criteria (UI-only)

- [ ] Create a column named **“Todo”**.
- [ ] Try to create another column named **“Todo”** → creation is blocked and the UI shows an inline message like **“Column title must be unique.”**
- [ ] Try to create **“  todo  ”** → also blocked (case-insensitive + trimmed).
- [ ] After each blocked attempt, the Debug panel’s **Column count** does **not** increase and the column list/order remains unchanged.
- [ ] The Action Log records a clear entry for blocked attempts (e.g., `Column add blocked (duplicate): "todo"`).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No persistence yet.
- No column renaming yet.

## Implementation notes (optional)

- Define a normalization function for comparison: `normalize(title) = title.trim().toLowerCase()`.
- If blocked, do not close the form; keep the input so the user can edit.

## Audit artifacts required (implementation agent)

Create `docs/audit/0005-prevent-duplicate-column-titles/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

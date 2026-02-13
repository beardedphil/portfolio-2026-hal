# Ticket

- **ID**: `0020`
- **Title**: Supabase: add persisted kanban columns model (enable Add column in Supabase mode)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0019`
- **Category**: `State`

## Goal (one sentence)

Add a real persistence model for kanban columns in Supabase so “Add column” works in Supabase mode and columns survive refresh/polling.

## Human-verifiable deliverable (UI-only)

When Supabase is connected, a human can:
- see columns loaded from Supabase (not hard-coded),
- click **Add column** to create a new column,
- refresh the page and see that new column still exists,
- drag a ticket into the new column and see it persist after polling/refresh,
- use in-app diagnostics to see column sync state and errors (no console needed).

## Acceptance criteria (UI-only)

- [ ] **Supabase schema** includes a `kanban_columns` table with at least:
  - `id` (text, primary key)
  - `title` (text, non-null)
  - `position` (int, non-null)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
- [ ] When Supabase is connected, the kanban UI loads columns from `kanban_columns` ordered by `position`.
- [ ] In Supabase mode, **Add column is visible**.
- [ ] Creating a column in Supabase mode:
  - adds a row to `kanban_columns`,
  - shows the new column immediately in the UI,
  - and it still appears after refresh/polling.
- [ ] Tickets can be moved into a custom column in Supabase mode:
  - dropping a ticket into the new column updates its `kanban_column_id` to the new column’s `id`,
  - after polling/refresh, the ticket remains in the new column.
- [ ] Default columns exist in Supabase:
  - if `kanban_columns` is empty (fresh project), the app initializes it with:
    - Unassigned, To-do, Doing, Done (positions 0..3)
  - this initialization is UI-verifiable (e.g. action log entry “Initialized default columns” or a diagnostics line).
- [ ] In-app diagnostics (Debug panel) shows:
  - columns source = Supabase
  - column count
  - last columns refresh time
  - last columns error (if any)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
  - Starting the dev server is acceptable if unavoidable, but verification after startup should be browser-only.
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Multi-board / multi-project support inside a single Supabase database
- Column editing UI (rename/delete) unless required for persistence correctness
- Real-time subscriptions (polling is fine)

## Implementation notes (optional)

- Today, Supabase mode uses a fixed set of column IDs (e.g. `col-unassigned`, `col-todo`, ...). This ticket makes columns dynamic.
- Keep backward compatibility:
  - tickets already in the four default columns should continue to appear correctly.
- Consider adding a minimal guard so unknown `kanban_column_id` values don’t silently fall back without a visible error.

## Audit artifacts required (implementation agent)

Create `docs/audit/0020-supabase-persisted-columns-model/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

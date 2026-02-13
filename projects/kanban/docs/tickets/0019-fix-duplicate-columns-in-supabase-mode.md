# Ticket

- **ID**: `0019`
- **Title**: Fix duplicate columns in Supabase mode (restore single source of columns)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0018`
- **Category**: `State`

## Goal (one sentence)

When Supabase board mode is active, show only the Supabase-driven columns (no duplicate default columns), and prevent “Add column” from creating confusing duplicates.

## Human-verifiable deliverable (UI-only)

A human can connect Supabase and see exactly one set of columns (Unassigned, To-do, Doing, Done) with working DnD, and no duplicate “To-do/Doing/Done” columns appear.

## Acceptance criteria (UI-only)

- [ ] Connect Supabase (any supported in-app connect flow). Confirm the board shows **exactly 4** columns:
  - Unassigned, To-do, Doing, Done
- [ ] In Supabase mode, **Add column** is not shown (or is disabled with a clear explanation) so users can’t create confusing duplicates.
- [ ] Regression: With Supabase disconnected and Ticket Store connected, **Add column** is visible and still works (ticket `0018` remains satisfied).
- [ ] Regression: Duplicate column title prevention still works in non-Supabase mode (ticket `0005` remains satisfied).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Supporting custom user-defined columns in Supabase mode (out of scope for this bugfix)

## Implementation notes (optional)

- Likely cause: `columnsForDisplay` combines Supabase columns with local columns (both contain default columns), creating duplicates.
- Fix should ensure Supabase mode uses the Supabase-derived columns/cards as the sole source of truth for rendering.

## Audit artifacts required (implementation agent)

Create `docs/audit/0019-fix-duplicate-columns-in-supabase-mode/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)

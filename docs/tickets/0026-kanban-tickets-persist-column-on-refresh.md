---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-01-31T20:53:23.742+00:00
---
## Ticket

- **ID**: 0026
- **Title**: Kanban tickets persist column on refresh
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P1

## Linkage (for tracking)

- **Fixes**: (user-reported: tickets moving columns on refresh)
- **Category**: State

## Ready for verification (implementation agent fills when work is pushed)

- **Branch**: `ticket/0026-kanban-tickets-persist-column-on-refresh` — QA (or the user) checks out this branch to verify, then merges to `main`.

## Goal (one sentence)

Fix Supabase-backed Kanban so that the last few moved tickets no longer revert to wrong columns after a page refresh.

## Human-verifiable deliverable (UI-only)

After moving tickets between columns (or reordering within a column), a full page refresh shows all tickets in the same columns and order as before refresh.

## Acceptance criteria (UI-only)

- [ ] Connect to a project (Supabase) and move several tickets to different columns.
- [ ] Refresh the page (F5).
- [ ] All tickets remain in the columns where they were placed; none "jump back" to previous columns.

## Constraints

- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Changing docs/ticket store (file-based) behavior.
- Changing polling interval or Supabase schema.

## Implementation notes (optional)

- Root cause: after each move we called `refetchSupabaseTickets()` immediately; the refetch could return before the DB write was visible (read-after-write), overwriting local state with stale data. Fix: optimistic local state update on move, persist to Supabase in background, and delay refetch (e.g. 1.5s) so the write is visible before we sync.

## Audit artifacts required (implementation agent)

Create `docs/audit/0026-kanban-tickets-persist-column-on-refresh/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

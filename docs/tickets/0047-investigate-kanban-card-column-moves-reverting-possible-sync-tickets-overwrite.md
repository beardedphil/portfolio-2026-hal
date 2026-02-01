---
kanbanColumnId: col-human-in-the-loop
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T00:00:00.000Z
---

## Ticket

- **ID**: 0047
- **Title**: Investigate why Kanban ticket column moves revert after refresh/restart (sync/persistence)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Category**: State

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0047-implementation`

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Identify and fix the root cause that makes Kanban cards “snap back” to previous columns after a refresh or dev-server restart.

## Human-verifiable deliverable (UI-only)

In the embedded Kanban UI, a human can drag a ticket card to a different column, wait at least 30 seconds (to cover polling), refresh the page, and optionally restart the dev server, and the card remains in the column where it was last placed.

## Acceptance criteria (UI-only)

- [ ] With Supabase connected, moving a ticket card from **To-do → Doing** (or any two different columns) persists: after waiting at least 30 seconds and refreshing the page, the card is still in the new column.
- [ ] The persistence holds across a dev-server restart: after restarting the dev server and reloading the app, the moved card is still in the new column.
- [ ] If a move cannot be persisted (e.g., Supabase update fails), the UI shows an in-app error message that explains the failure in human terms (not console-only), and the card does not silently “revert later.”
- [ ] The UI includes a visible “ticket persistence” indicator that helps diagnose this bug without the console, such as:
  - [ ] A “Last tickets refresh” timestamp
  - [ ] A “Last move persisted / failed” status with a timestamp

## Constraints

- Keep scope limited to diagnosing and fixing this specific reversion behavior; do not redesign the entire Kanban.
- Verification must be UI-only (no terminal/devtools/console required to confirm the fix).
- Do not weaken the “Supabase is the source of truth” approach; instead make the app’s persistence behavior reliable and observable.

## Non-goals

- Adding new Kanban columns or changing the canonical column list.
- Large refactors of ticket schema or migration work.
- Implementing role-based permissions.

## Implementation notes (optional)

Suspected causes to investigate (pick the actual root cause and fix it):

- **Move write not persisting**: drag/drop handler updates local state but Supabase `tickets.kanban_column_id` update fails or is skipped.
- **Stale refetch overwrites**: after a successful move, an immediate or delayed refetch/poll returns older data and overwrites the optimistic state (see `SUPABASE_POLL_INTERVAL_MS` and `REFETCH_AFTER_MOVE_MS` behavior in `projects/kanban/src/App.tsx`).
- **sync-tickets overwrite**: a `sync-tickets.js` run (Docs→DB) may be re-importing old `kanbanColumnId` frontmatter values from `docs/tickets/*.md` into Supabase, resetting columns after restart or after certain actions (delete/create workflows often run sync).

Concrete repro reports from PM:
- Cards can be moved in the UI but “eventually” revert back (often after dev server restart).
- Example tickets observed reverting: 0027, 0035, 0037, 0044.

Touchpoints likely involved:
- `projects/kanban/src/App.tsx` (drag/drop persistence + polling)
- `scripts/sync-tickets.js` and/or `projects/kanban/scripts/sync-tickets.js` and/or `projects/hal-agents/scripts/sync-tickets.js` (Docs↔DB sync behavior)

## Audit artifacts required (implementation agent)

Create `docs/audit/0047-investigate-kanban-moves-reverting/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md` (use `docs/templates/pm-review.template.md`)
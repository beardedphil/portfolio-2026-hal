---
kanbanColumnId: col-human-in-the-loop
kanbanPosition: 0
kanbanMovedAt: 2026-01-31T22:46:05.141Z
---
## Ticket

- **ID**: 0039
- **Title**: Fix ticket deletion + other ticket actions to persist to Supabase (no “deleted tickets reappear”)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: 0030
- **Category**: State

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0039-fix-ticket-deletion-and-ui-actions-persist-to-db`
- **Commit**: feat(0039): fix ticket deletion persistence to Supabase
- **Pushed**: Yes
- **Status**: Ready for QA review

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Goal (one sentence)
Ensure that ticket actions performed in the Kanban UI (especially delete) are persisted to Supabase and reliably propagate out (no “deleted tickets reappear”).

## Human-verifiable deliverable (UI-only)
In the embedded Kanban UI, a human can delete a ticket, wait up to ~10 seconds, and confirm the ticket does not reappear after refresh/reopen, and the UI shows a clear “Deleted”/success confirmation in-app.

## Acceptance criteria (UI-only)
- [ ] Deleting a ticket from the embedded Kanban UI removes it immediately from the ticket list and shows an in-app confirmation.
- [ ] After waiting up to ~10 seconds (poll interval), the deleted ticket does not reappear without a manual refresh.
- [ ] After a manual page refresh (Cmd/Ctrl+R), the deleted ticket still does not reappear.
- [ ] If deletion fails (permission, network, Supabase error), the UI shows an in-app error message explaining that the delete did not persist.
- [ ] All other ticket actions in the UI that claim to change state (move column, edit body/title) persist after refresh/reopen.

## Constraints
- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.
- Supabase is the source of truth: UI actions must write to Supabase first; repo `docs/tickets/*.md` is derived via sync.

## Non-goals
- Building a full audit log/history UI for all ticket changes.
- Implementing user authentication/roles beyond what is needed to make persistence work.

## Implementation notes (optional)
- Suspected causes for “deleted tickets reappear”: UI only mutates local state; delete endpoint is a no-op; delete not awaited; optimistic update without rollback; list polling is reading from a different source (filesystem-derived docs sync) than the UI write path; Supabase RLS prevents delete so it silently fails.
- Prefer a “soft delete” (`deleted_at`) if hard delete breaks sync assumptions; but the user-facing behavior must be “ticket is gone.”

## Audit artifacts required (implementation agent)
Create `docs/audit/0039-fix-ticket-deletion-and-ui-actions-persist-to-db/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
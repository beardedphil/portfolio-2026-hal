# Title
Ticket list: add Delete button and sync deletion to filesystem

## Owner
Unassigned

## Type
Feature

## Priority
P1

## Linkage
- Related: ticket syncing flow in `vite.config.ts` (server) and `scripts/sync-tickets.js`

## Goal (one sentence)
Allow a user to delete a ticket from the UI and have that deletion propagate to Supabase and the local `docs/tickets/` filesystem via the existing sync mechanism.

## Human-verifiable deliverable (UI-only)
In the app’s ticket list/board UI, each ticket row/card has a visible **Delete** action; when clicked and confirmed, the ticket disappears from the UI and is removed from the local `docs/tickets/` folder after the app runs the sync step (no terminal/devtools needed to verify).

## Acceptance criteria (UI-only)
- [ ] Each ticket item (row/card) shows a **Delete** button (or overflow menu item) that is discoverable and consistent across ticket list views.
- [ ] Clicking **Delete** prompts for confirmation (to prevent accidental deletion).
- [ ] After confirming, the ticket is deleted in the backend (Supabase) and no longer appears in the UI after refresh.
- [ ] After deletion, the app triggers the existing sync process and the corresponding markdown file under `docs/tickets/<id>-<slug>.md` is removed locally.
- [ ] If deletion or sync fails, the user sees an in-app error state in the diagnostics/debug UI describing what failed (no console required).

## Constraints
- Must follow the existing “sync-tickets” approach used after ticket creation (do not invent a separate manual step).
- Deletion must be safe: require explicit user confirmation.
- Do not require terminal commands or devtools for verification.
- Do not delete unrelated files; deletion should be scoped to the specific ticket’s markdown file.

## Non-goals
- Bulk delete / multi-select delete.
- Editing ticket content as part of this change.
- Changing ticket ID assignment or creation behavior.

## Implementation notes
- Identify where tickets are rendered in the embedded kanban UI (`projects/kanban`) and add the Delete action there.
- Add a server endpoint to delete a ticket (Supabase row) analogous to the create flow; then trigger `scripts/sync-tickets.js` after successful deletion, similar to how create triggers sync.
- Ensure sync supports deletions (i.e., removes local markdown files for tickets no longer present in Supabase). If it currently only adds/updates, extend it.

## Audit artifacts
Create the standard audit folder and files under:
- `docs/audit/<task-id>-<short-title>/plan.md`
- `docs/audit/<task-id>-<short-title>/worklog.md`
- `docs/audit/<task-id>-<short-title>/changed-files.md`
- `docs/audit/<task-id>-<short-title>/decisions.md`
- `docs/audit/<task-id>-<short-title>/verification.md`
- `docs/audit/<task-id>-<short-title>/pm-review.md`
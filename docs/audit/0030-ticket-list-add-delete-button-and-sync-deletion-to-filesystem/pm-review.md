# PM review: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Deliverable

- Each ticket card in the Kanban board has a visible **Delete** button when Supabase is connected.
- Clicking Delete prompts for confirmation.
- After confirming, the ticket is deleted in Supabase, no longer appears in the UI, and the local docs/tickets/ markdown file is removed via sync.
- Deletion/sync errors are shown in the Debug panel and in-app banner.

## Acceptance criteria

- [x] Each ticket item (row/card) shows a Delete button that is discoverable and consistent across ticket list views.
- [x] Clicking Delete prompts for confirmation (to prevent accidental deletion).
- [x] After confirming, the ticket is deleted in the backend (Supabase) and no longer appears in the UI after refresh.
- [x] After deletion, the app triggers the existing sync process and the corresponding markdown file under docs/tickets/<id>-<slug>.md is removed locally.
- [x] If deletion or sync fails, the user sees an in-app error state in the diagnostics/debug UI describing what failed (no console required).

## Constraints

- Followed existing sync-tickets approach used after ticket creation.
- Deletion is safe: explicit user confirmation required.
- No terminal commands or devtools required for verification.
- Deletion scoped to the specific ticket's markdown file only.

## Non-goals

- Bulk delete / multi-select delete.
- Editing ticket content.
- Changing ticket ID assignment or creation behavior.

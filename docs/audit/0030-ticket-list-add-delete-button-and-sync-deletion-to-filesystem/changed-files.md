# Changed files: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Modified

- `scripts/sync-tickets.js`
  - Delete local files for ticket IDs in docs but no longer in Supabase.
  - Console output includes deleted count when > 0.
- `vite.config.ts`
  - tickets-delete-endpoint plugin: POST /api/tickets/delete, CORS, delete from Supabase, run sync-tickets.
- `projects/kanban/src/App.tsx`
  - HAL_API_BASE; SortableCard Delete button; SortableColumn onDeleteTicket/showDelete; handleDeleteTicket; supabaseLastDeleteError; error banner; Debug panel row.
- `projects/kanban/src/index.css`
  - .ticket-card flex layout; .ticket-card-title; .ticket-card-delete.

## Created

- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/plan.md`
- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/worklog.md`
- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/changed-files.md`
- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/decisions.md`
- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/verification.md`
- `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/pm-review.md`

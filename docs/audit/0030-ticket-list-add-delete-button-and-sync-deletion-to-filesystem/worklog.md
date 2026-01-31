# Worklog: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Summary

- Extended sync-tickets.js to delete local markdown files for ticket IDs that exist in docs but are no longer in Supabase.
- Added POST /api/tickets/delete endpoint in vite.config.ts: deletes from Supabase, runs sync-tickets with SUPABASE_URL/SUPABASE_ANON_KEY.
- Added Delete button to each ticket card in the kanban when Supabase is connected; requires confirmation before deletion.
- Delete errors shown in Debug panel (Last delete error) and in-app banner.

## Changes

### scripts/sync-tickets.js

- Doc comment: added DB→Docs (deletions) step.
- After DB→Docs write loop: for each doc ticket whose id is not in Supabase, delete the local file (fs.unlinkSync).
- Final console.log includes deletedFromDocs count when > 0.

### vite.config.ts

- Added tickets-delete-endpoint plugin: POST /api/tickets/delete.
- CORS headers for kanban iframe (5174) calling HAL (5173).
- Body: ticketId, supabaseUrl, supabaseAnonKey, projectRoot?.
- Delete from Supabase tickets where id = ticketId.
- Run node scripts/sync-tickets.js with env; return { success } or { success: false, error }.

### projects/kanban/src/App.tsx

- HAL_API_BASE constant (VITE_HAL_API_URL or http://localhost:5173).
- SortableCard: added onDelete, showDelete props; ticket-card-title span; Delete button with stopPropagation to prevent drag.
- SortableColumn: added onDeleteTicket, showDelete props; pass to SortableCard.
- supabaseLastDeleteError state.
- handleDeleteTicket: confirm, fetch HAL_API_BASE/api/tickets/delete, refetch on success, set error on failure; post HAL_SYNC_COMPLETED for parent.
- In-app error banner for supabaseLastDeleteError.
- Debug panel: Last delete error row.

### projects/kanban/src/index.css

- .ticket-card: display flex, gap; .ticket-card-title flex: 1; .ticket-card-delete styling.

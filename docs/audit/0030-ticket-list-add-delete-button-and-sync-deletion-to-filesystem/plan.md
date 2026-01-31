# Plan: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Goal

Allow a user to delete a ticket from the UI and have that deletion propagate to Supabase and the local `docs/tickets/` filesystem via the existing sync mechanism.

## Analysis

### Current State

- Kanban board shows tickets as cards in columns; tickets come from Supabase when connected.
- sync-tickets.js: Docs → DB (upsert), DB → Docs (write new files for DB rows not in docs). No deletion of local files.
- No delete action exists on ticket cards.

### Approach

1. **Delete button on each ticket card**: Add a visible Delete button to SortableCard when Supabase board is active.
2. **Confirmation**: Require explicit user confirmation before deletion.
3. **API endpoint**: Add `POST /api/tickets/delete` that: deletes the ticket from Supabase; runs sync-tickets.js to remove the local file.
4. **Sync script extension**: Extend sync-tickets.js to delete local markdown files for ticket IDs that exist in docs but are no longer in Supabase.
5. **Error handling**: Show delete/sync errors in Debug panel and in-app error banner.

## Implementation Steps

1. Extend sync-tickets.js: after Docs→DB and DB→Docs, delete local files for ticket IDs in docs but not in Supabase.
2. Add POST /api/tickets/delete middleware in vite.config.ts: delete from Supabase, run sync-tickets with creds.
3. Add Delete button to SortableCard (projects/kanban); pass onDeleteTicket and showDelete when supabaseBoardActive.
4. Add handleDeleteTicket callback: confirm, call API, refetch tickets; set supabaseLastDeleteError on failure.
5. Show supabaseLastDeleteError in Debug panel and in-app banner.

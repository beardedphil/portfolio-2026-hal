# Verification (UI-only): 0011 - PM agent: create ticket into Unassigned from chat

## Prerequisites

- Project folder connected (with .env containing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for a Supabase project that has `tickets` and `kanban_columns` tables).
- HAL app running (e.g. npm run dev from repo root); Kanban app running (e.g. port 5174).
- hal-agents built (`npm run build` in projects/hal-agents).

## Steps

1. Open HAL; connect the project folder (same Supabase as Kanban).
2. Select Project Manager chat; send a few messages to establish context (e.g. "We need a ticket for adding a dark mode toggle").
3. Send a clear ticket-creation command (e.g. "Create a ticket for that" or "Create ticket").
4. Confirm the PM reply indicates a ticket was created and states the ticket ID and file path (e.g. docs/tickets/NNNN-title-slug.md).
5. Open Diagnostics; expand and confirm:
   - Outbound Request JSON (redacted) is present.
   - Tool Calls includes create_ticket with output showing success, id, filename, filePath.
   - Ticket creation section shows: Ticket ID, File path, Sync: Success (or Failed with error if sync-tickets failed).
6. Confirm the new ticket appears in the Kanban board under **Unassigned** (within normal poll interval; refresh if needed).
7. Optionally run `npm run sync-tickets` from repo root and confirm docs/tickets/NNNN-*.md exists with the expected content.

## Pass criteria

- With a project connected, the user can trigger ticket creation via chat and see a new ticket in Unassigned.
- The ticket has an ID, title, and body consistent with the repo ticket template (goal, deliverable, acceptance criteria, etc.).
- Diagnostics shows the created ticket ID, file path, and sync status without using terminal or devtools.
- The PM agent does not move the ticket out of Unassigned (that is ticket 0012).

# PM review: 0011 - PM agent: create ticket into Unassigned from chat

## Deliverable

- PM agent can create a ticket from chat when the user asks (e.g. "create ticket" or "create a ticket for that").
- Ticket is stored to Supabase first; sync-tickets is run by the server so the ticket file appears under docs/tickets/ and the ticket shows in Kanban Unassigned.
- Diagnostics shows ticket ID, file path, and sync status (success/error).

## Acceptance criteria

- [x] With a project connected, a human can converse with the PM and then trigger ticket creation (UI button or clear chat command). Trigger is chat command; LLM uses create_ticket tool.
- [x] The PM agent produces a ticket that meets the repo template basics (ID, title, goal, deliverable, acceptance criteria, etc.); body_md is provided by the LLM and written to Supabase then to docs/tickets/ via sync.
- [x] The new ticket appears in the kanban board in Unassigned (sync-tickets writes to repo; Kanban reads from Supabase; ticket has kanban_column_id = 'col-unassigned').
- [x] Diagnostics shows outbound request JSON (redacted), exact file path created, ticket ID, and sync operation status (success/error).
- [x] The PM agent does not move the ticket out of Unassigned (no such logic in this ticket).

## Constraints

- Task kept minimal and human-verifiable from the UI (no terminal required for verification).
- Ticket creation is safe: next id from Supabase avoids overwriting; body is from LLM with instruction not to write secrets.
- After writing to Supabase, sync-tickets is run so the ticket appears in the repo and on the board.

## Non-goals

- Full "ready for verification" flow (0012); this ticket is create + Unassigned only.
- Kanban mutations beyond creation (e.g. moving tickets).

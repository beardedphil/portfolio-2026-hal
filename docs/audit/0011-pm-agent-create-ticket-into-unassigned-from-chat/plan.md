# Plan: 0011 - PM agent: create ticket into Unassigned from chat

## Goal

Allow the user to have a back-and-forth PM conversation and, when ready, have the PM agent create a new ticket that appears in the Kanban **Unassigned** column. Ticket is stored to Supabase first; sync-tickets then writes it to the repo.

## Analysis

### Current State

- PM agent has read-only tools only (list_directory, read_file, search_files).
- No tool exists for the external LLM to create a ticket.
- sync-tickets.js already supports DB→Docs: it writes `docs/tickets/{filename}` for each Supabase ticket row not present in docs.

### Approach

1. **create_ticket tool** (in hal-agents): When Supabase creds are passed in config, register a tool that:
   - Queries Supabase `tickets` for existing ids to compute next id.
   - Inserts a new row: id, filename (id-slug.md), title, body_md, kanban_column_id = 'col-unassigned', kanban_position = 0.
   - Returns { success, id, filename, filePath } or { error }.
2. **Vite middleware**: Pass supabaseUrl/supabaseAnonKey from request body to runPmAgent so create_ticket is available when project is connected. After runPmAgent returns, if create_ticket succeeded, run `node scripts/sync-tickets.js` with env SUPABASE_URL/SUPABASE_ANON_KEY so the new row is written to docs/tickets/.
3. **Response**: Add ticketCreationResult (id, filename, filePath, syncSuccess, syncError) to PM response for diagnostics.
4. **UI**: Show ticket creation result in Diagnostics (ticket ID, file path, sync status).

## Implementation Steps

1. Add supabaseUrl/supabaseAnonKey to PmAgentConfig; add create_ticket tool (conditionally when both set).
2. Update PM system instructions so the agent uses create_ticket when the user asks to create a ticket; instruct not to invent ID or write secrets.
3. In vite.config.ts: pass Supabase to runPmAgent; after run, if create_ticket succeeded, spawn sync-tickets with env; build response with ticketCreationResult.
4. In App.tsx: add ticketCreationResult to PmAgentResponse and DiagnosticsInfo; display ticket creation (id, file path, sync status) in Diagnostics panel.

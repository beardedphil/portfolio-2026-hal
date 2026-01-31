# Worklog: 0011 - PM agent: create ticket into Unassigned from chat

## Summary

- Implemented create_ticket tool in PM agent (hal-agents): inserts new ticket into Supabase with next available id, filename id-slug.md, kanban_column_id = 'col-unassigned'.
- Tool is only registered when supabaseUrl and supabaseAnonKey are set in PmAgentConfig.
- Vite middleware passes Supabase creds from request to runPmAgent; after a successful create_ticket tool call, runs sync-tickets (node scripts/sync-tickets.js) with SUPABASE_URL/SUPABASE_ANON_KEY so the new row is written to docs/tickets/.
- Response includes ticketCreationResult (id, filename, filePath, syncSuccess, syncError) for diagnostics.
- HAL App shows ticket creation result in Diagnostics (ticket ID, file path, sync status).

## Changes

### projects/hal-agents/src/agents/projectManager.ts

- Import createClient from @supabase/supabase-js.
- Added slugFromTitle() for filename slug.
- PmAgentConfig: optional supabaseUrl, supabaseAnonKey.
- PM_SYSTEM_INSTRUCTIONS: added guidance to use create_ticket when user asks to create a ticket; full markdown body following template; do not invent ID; do not write secrets; report exact ticket ID and file path after creation.
- create_ticket tool (when Supabase set): get next id from Supabase tickets, insert row (id, filename, title, body_md, kanban_column_id 'col-unassigned', kanban_position 0, kanban_moved_at now), return { success, id, filename, filePath } or { error }.

### vite.config.ts

- Import spawn from child_process.
- PmAgentResponse: added ticketCreationResult (id, filename, filePath, syncSuccess, syncError?).
- Pass supabaseUrl/supabaseAnonKey to runPmAgent when present.
- After runPmAgent: if a tool call was create_ticket with success, run node scripts/sync-tickets.js with cwd repoRoot and env SUPABASE_URL/SUPABASE_ANON_KEY; set ticketCreationResult.syncSuccess and syncError from spawn result.
- Build response object including ticketCreationResult when present.

### src/App.tsx

- TicketCreationResult type; PmAgentResponse.ticketCreationResult.
- DiagnosticsInfo.lastTicketCreationResult.
- State lastTicketCreationResult; set from data.ticketCreationResult; clear on disconnect.
- Diagnostics panel: "Ticket creation" section when lastTicketCreationResult present (ticket ID, file path, Sync: Success / Failed + error).

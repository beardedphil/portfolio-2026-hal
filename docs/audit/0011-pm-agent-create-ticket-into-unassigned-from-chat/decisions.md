# Decisions: 0011 - PM agent: create ticket into Unassigned from chat

## Store to Supabase first, then sync to repo

Ticket creation flow: LLM calls create_ticket → tool inserts into Supabase `tickets` table → server runs sync-tickets so the new row is written to docs/tickets/. This avoids requiring local filesystem write access from the agent; the sync script (existing mechanism) handles DB→Docs. User or CI can also run sync-tickets manually.

## create_ticket only when project connected

The create_ticket tool is registered only when supabaseUrl and supabaseAnonKey are provided in PmAgentConfig (i.e. when the user has connected a project folder with Supabase in .env). No Supabase means no ticket store, so the tool is not exposed.

## Next ID from Supabase

Next ticket id is computed by querying Supabase for all ticket ids, parsing numeric part, and using max+1 (padded to 4 digits). This avoids overwriting existing ids and works even if docs/tickets/ has not been synced yet.

## Sync run by server after create_ticket success

The Vite dev server runs `node scripts/sync-tickets.js` with SUPABASE_URL and SUPABASE_ANON_KEY set from the request body after a successful create_ticket tool call. Sync writes the new ticket row to docs/tickets/{filename}. Result (syncSuccess, syncError) is included in ticketCreationResult for diagnostics.

## Diagnostics: ticket ID, file path, sync status

Diagnostics panel shows last ticket creation result when present: ticket ID, file path (e.g. docs/tickets/NNNN-slug.md), and sync status (Success or Failed with error snippet). No external tools required for verification.

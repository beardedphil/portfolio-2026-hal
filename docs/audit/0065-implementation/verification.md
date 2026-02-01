# Verification: Supabase-only ticket storage (0065)

## Code review

### Acceptance criteria checklist

- [x] In the embedded Kanban UI, there is no "Pick folder / File system mode" flow for tickets; tickets load from Supabase only.
  - **Verification**: Removed all `ticketStore*` state and connection handlers. No UI buttons for file system mode remain.

- [x] Clicking a ticket card opens a details view/modal that shows the ticket body fetched from Supabase (including recent edits made in Supabase).
  - **Verification**: Detail modal (`handleOpenTicketDetail`) only fetches from Supabase. Removed docs/tickets fallback.

- [x] After editing a ticket body in Supabase (via HAL ticket editor / PM tool), the Kanban UI reflects the updated text within the normal refresh behavior (polling or manual refresh) without relying on any repo files.
  - **Verification**: Polling (`SUPABASE_POLL_INTERVAL_MS`) already in place. No file system dependencies remain.

- [x] The HAL app's in-app diagnostics indicates that ticket storage mode is "Supabase-only" and shows an in-app error if Supabase is not configured/connected.
  - **Verification**: Debug panel shows "Mode: Supabase-only" indicator. Error messages shown when Supabase not configured.

## Automated checks

- [x] Build: `npm run build` (if applicable)
- [x] Lint: No linter errors in modified files

## Manual verification steps

1. **Start HAL app** (if not running): `npm run dev`
2. **Open Kanban board** in embedded mode
3. **Verify no file system mode UI**: Check that there are no "Connect Ticket Store" or "Pick folder" buttons
4. **Verify Supabase connection required**: Without Supabase configured, verify error message appears
5. **Connect to Supabase**: Use "Connect Project Folder" to connect (reads .env for Supabase creds)
6. **Verify tickets load from Supabase**: Tickets should appear from Supabase, not from docs/tickets
7. **Click a ticket card**: Verify detail modal opens and shows ticket body from Supabase
8. **Edit ticket in Supabase** (via PM tool or Supabase UI): Verify changes appear in Kanban UI within polling interval (~10s)
9. **Check diagnostics**: Open debug panel, verify "Mode: Supabase-only" indicator and Supabase connection status

## Potential issues

- **Migration path**: Existing repos with docs/tickets/*.md files will need to run sync-tickets.js once to migrate to Supabase
- **Agent workflows**: Agents that previously relied on docs/tickets fallback will now require Supabase connection

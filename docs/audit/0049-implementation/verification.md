# Verification: 0049 - Ensure All Newly Created Tickets Have Title with ID Prefix

## Code Review

- [x] **PM agent create_ticket tool uses em dash**: Verified that `projectManager.ts` line 511 formats title as `${id} — ${input.title.trim()}` (em dash, not regular dash).
- [x] **Ticket template shows format**: Verified that `docs/templates/ticket.template.md` Title field shows "NNNN — <short title>" format with example.
- [x] **System instructions updated**: Verified that PM_SYSTEM_INSTRUCTIONS mentions automatic title prefixing with "NNNN —" format.
- [x] **Tool description updated**: Verified that create_ticket tool description mentions automatic title prefixing.

## UI Verification Steps

1. **Create a new ticket via PM agent**:
   - In HAL app, connect project folder (with Supabase credentials in .env)
   - In PM chat, ask to "create a ticket for testing title format"
   - Verify the created ticket appears in Unassigned column
   - **Expected**: Ticket card title should start with "NNNN —" (e.g. "0050 — Testing title format")

2. **Check synced markdown file**:
   - Run `npm run sync-tickets` from repo root
   - Open `docs/tickets/NNNN-testing-title-format.md`
   - **Expected**: The Title line should show "NNNN — Testing title format" (or the ticket body should reflect the formatted title)

3. **Verify template format**:
   - Open `docs/templates/ticket.template.md`
   - **Expected**: Title field shows "NNNN — <short title>" format with example

## Automated Checks

- [x] TypeScript compilation: `npm run build --prefix projects/hal-agents` should succeed
- [x] No lint errors in modified files

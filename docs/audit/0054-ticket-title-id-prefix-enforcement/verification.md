# Verification Steps

## Automated Checks

1. **Build check**: TypeScript compilation (no linter errors)
2. **Code review**: All normalization functions follow same pattern

## Manual UI Verification (Human in the Loop)

### Test Case 1: Existing Ticket (e.g. 0048)
1. Open HAL app at http://localhost:5173
2. Connect Supabase project folder
3. Open ticket **0048** (or any existing ticket) in the ticket detail modal
4. **Verify**: The in-body `- **Title**:` line shows `0048 — <title>` (with ID prefix)
5. **Verify**: If the ticket was missing the prefix, a diagnostic message appears: "Ticket 0048: Title normalized to include ID prefix"
6. Refresh the page
7. **Verify**: The Title line still includes the ID prefix after refresh

### Test Case 2: New Ticket Creation
1. In HAL app, use PM chat to create a new ticket (e.g. "create a ticket for testing ID prefix")
2. **Verify**: The newly created ticket's `- **Title**:` line begins with the assigned ID prefix (e.g. `0055 — Testing ID prefix`)
3. Open the ticket in the detail modal
4. **Verify**: The Title line shows the ID prefix
5. Refresh the page
6. **Verify**: The Title line still includes the ID prefix after refresh

### Test Case 3: Sync Tickets Action
1. In HAL app, run "sync tickets" action (if available in UI) or run `npm run sync-tickets` from terminal
2. **Verify**: All tickets in `docs/tickets/*.md` have Title lines with ID prefix
3. Open any ticket in the UI
4. **Verify**: The Title line includes the ID prefix

### Test Case 4: Title Edit/Regeneration
1. Open a ticket in the detail modal
2. If ticket editing is available, edit the title (or trigger a system regeneration)
3. **Verify**: The Title line automatically includes the ID prefix after edit/regeneration
4. **Verify**: Diagnostic message appears if normalization occurred

### Test Case 5: Diagnostics Visibility
1. Open a ticket that was missing the ID prefix (or manually remove it from a test ticket)
2. **Verify**: When the ticket is opened, a diagnostic message appears in the action log: "Ticket <ID>: Title normalized to include ID prefix"
3. **Verify**: The message is human-readable and clearly indicates which component performed the normalization

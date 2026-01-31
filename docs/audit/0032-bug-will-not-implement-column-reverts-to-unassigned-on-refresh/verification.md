# Verification: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Build

- `cd projects/kanban && npm run build` succeeds.

## Human-verifiable steps (UI-only)

1. Connect Kanban to Supabase (Connect project folder, enter credentials).
2. Ensure the **Will Not Implement** column is visible (it will be added via seed or migration).
3. Move a ticket card to **Will Not Implement**.
4. Refresh the page (or close/reopen the Kanban UI).
5. The ticket remains in **Will Not Implement** (does not return to Unassigned).

## Sync verification

1. With a ticket in Will Not Implement, run `npm run sync-tickets` from project root.
2. Refresh Kanban; the ticket should still be in Will Not Implement (sync no longer resets it).

## Error handling (existing behavior)

- When `updateSupabaseTicketKanban` fails, `setSupabaseLastError` is called and the UI shows "Last poll error". The ticket reverts via refetchSupabaseTickets (existing behavior from 0026).

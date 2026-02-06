# Plan: 0083 - Auto-move Ready Tickets to To Do on Creation

## Goal
When a ticket is created in HAL, automatically ensure it meets the Ready-to-start format and then place it in the To Do column.

## Approach

1. **Modify create_ticket tool** (`projects/hal-agents/src/agents/projectManager.ts`):
   - After successfully creating a ticket and evaluating readiness
   - If the ticket is ready (`readiness.ready === true`), automatically move it to To Do column
   - Use the same logic as `kanbanMoveTicketToTodoTool` to compute position and update the ticket
   - Return `movedToTodo: true` in the output if successful, or `moveError` if the move fails
   - If not ready, keep ticket in Unassigned and return `missingItems` (already implemented)

2. **Update UI to show auto-move status** (`src/App.tsx`):
   - Extend `TicketCreationResult` type to include `movedToTodo`, `moveError`, `ready`, and `missingItems`
   - Update ticket creation message to indicate:
     - If moved to To Do: "The ticket is ready and has been automatically moved to **To Do**"
     - If move failed: Show error message
     - If not ready: Show missing items (already handled)

3. **Update vite.config.ts**:
   - Extract `movedToTodo`, `moveError`, `ready`, and `missingItems` from create_ticket tool output
   - Pass these fields through to the frontend in `ticketCreationResult`

## File Touchpoints

- `projects/hal-agents/src/agents/projectManager.ts` - Modify create_ticket tool to auto-move ready tickets
- `src/App.tsx` - Update TicketCreationResult type and UI messages
- `vite.config.ts` - Extract and pass through move status fields

## Notes

- Normalization already happens before readiness evaluation (line 637: `normalizeBodyForReady`)
- The `evaluateTicketReady` function is already called after ticket creation
- Existing tickets and manual moves are unaffected (only new ticket creation is modified)
- The UI already shows missing items in diagnostics, so that requirement is met

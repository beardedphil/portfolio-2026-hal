# Worklog: 0083 - Auto-move Ready Tickets to To Do on Creation

## Implementation Steps

1. **Modified create_ticket tool** (`projects/hal-agents/src/agents/projectManager.ts`):
   - After ticket creation and readiness evaluation (line 737), added auto-move logic
   - If `readiness.ready === true`, automatically moves ticket to To Do column
   - Computes next position in To Do column (handles both repo-scoped and legacy modes)
   - Updates ticket's `kanban_column_id` to `col-todo`, sets position, and updates `kanban_moved_at`
   - Returns `movedToTodo: true` on success, or `moveError` if move fails
   - If not ready, returns `missingItems` (already existed)

2. **Updated TicketCreationResult type** (`src/App.tsx`):
   - Added `movedToTodo?: boolean` field
   - Added `moveError?: string` field
   - Added `ready?: boolean` field
   - Added `missingItems?: string[]` field

3. **Updated UI messages** (`src/App.tsx`):
   - Modified ticket creation summary message to show:
     - Success message when moved to To Do
     - Error message if move failed
     - Missing items message if ticket is not ready

4. **Updated vite.config.ts**:
   - Extended create_ticket output type to include `movedToTodo`, `moveError`, `ready`, and `missingItems`
   - Passes these fields through to frontend in `ticketCreationResult`

## Verification

- Normalization happens before readiness evaluation (confirmed: line 637)
- Auto-move only happens for ready tickets
- Error handling for move failures
- UI shows appropriate messages for all scenarios
- Existing tickets and manual moves unaffected (only new ticket creation modified)

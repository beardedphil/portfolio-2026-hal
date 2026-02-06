# Verification (0084-implementation)

## Code Review

- [x] `handleWorkButtonClick` moves ticket to Doing when Implementation agent work button is clicked from To Do or Unassigned
- [x] Message handler for `HAL_TICKET_IMPLEMENTATION_COMPLETE` moves ticket from Doing to QA
- [x] HAL app sends completion message when implementation agent finishes successfully
- [x] Ticket lookup supports both PK and display_id formats
- [x] Column movement validates current ticket state before moving
- [x] No lint errors

## UI Verification Steps

### Test: Automatic move to Doing on work start

1. Open HAL app at http://localhost:5173
2. Connect project folder (if not already connected)
3. Ensure Kanban board shows at least one ticket in To Do column
4. Click "Implement top ticket" button on To Do column
5. **Expected**: Ticket immediately moves to Doing column
6. **Expected**: Chat opens with Implementation agent and message is sent
7. **Expected**: Ticket remains in Doing column while work is in progress

### Test: Automatic move to QA on completion

1. Start Implementation agent work on a ticket (ticket should be in Doing)
2. Wait for Implementation agent to complete work (status shows "Completed")
3. **Expected**: Ticket automatically moves from Doing to QA column
4. **Expected**: Column counts update correctly (Doing count decreases, QA count increases)

### Test: Ticket detail view reflects column changes

1. Open a ticket detail view (click on ticket card)
2. Start Implementation work (ticket moves to Doing)
3. **Expected**: Ticket detail view shows ticket is in Doing column
4. Complete Implementation work (ticket moves to QA)
5. **Expected**: Ticket detail view shows ticket is in QA column

### Test: Manual moves are not overridden

1. Manually drag a ticket from Doing to another column (e.g., To Do)
2. Start Implementation work on a different ticket
3. **Expected**: Manually moved ticket stays in its new column
4. **Expected**: Only the ticket being worked on moves automatically

### Test: Column counts update correctly

1. Note the count in Doing and QA columns
2. Start Implementation work on a ticket in To Do
3. **Expected**: Doing count increases by 1, To Do count decreases by 1
4. Complete Implementation work
5. **Expected**: QA count increases by 1, Doing count decreases by 1

## Automated Checks

- Build succeeds: `npm run build` (in both root and projects/kanban)
- No TypeScript errors
- No lint errors

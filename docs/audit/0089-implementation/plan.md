# Plan: Close Ticket After HITL Pass/Fail (0089)

## Goal
Ensure that when a human records Pass or Fail in the Human-in-the-Loop (HITL) step, the ticket detail modal is closed after the move completes, returning the user to the Kanban board.

## Approach
1. **Update onValidationPass handler**
   - After successfully moving ticket to Done, close the ticket detail modal
   - Close modal after refetch delay to ensure move is reflected in UI

2. **Update onValidationFail handler**
   - After successfully moving ticket to To Do, close the ticket detail modal
   - Close modal after refetch delay to ensure move is reflected in UI

3. **Ensure consistent behavior**
   - Modal closes regardless of how ticket detail was opened
   - No lingering "open ticket" state after close

## File touchpoints
- `projects/kanban/src/App.tsx` - Update `onValidationPass` and `onValidationFail` handlers to call `handleCloseTicketDetail` after move completes

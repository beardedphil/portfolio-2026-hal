# Worklog: Close Ticket After HITL Pass/Fail (0089)

## Implementation steps

1. **Updated onValidationPass handler**
   - Added `setTimeout` call to close ticket detail modal after move completes
   - Close happens after `REFETCH_AFTER_MOVE_MS + 100` to ensure refetch completes first
   - Uses existing `handleCloseTicketDetail` function

2. **Updated onValidationFail handler**
   - Added `setTimeout` call to close ticket detail modal after move completes
   - Close happens after `REFETCH_AFTER_MOVE_MS + 100` to ensure refetch completes first
   - Uses existing `handleCloseTicketDetail` function

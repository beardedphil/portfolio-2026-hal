# Changed Files: Close Ticket After HITL Pass/Fail (0089)

## Modified files

### `projects/kanban/src/App.tsx`
- **Updated `onValidationPass` handler**: Added `setTimeout` to call `handleCloseTicketDetail()` after move completes (line ~2574)
- **Updated `onValidationFail` handler**: Added `setTimeout` to call `handleCloseTicketDetail()` after move completes (line ~2631)

# Changed Files

## Modified Files

### `projects/kanban/src/App.tsx`
- Added `lastMovePersisted` state to track success/failure of move operations with timestamp
- Added `pendingMoves` state to track tickets with pending persistence operations
- Modified `refetchSupabaseTickets()` to accept `skipPendingMoves` parameter and preserve optimistic updates
- Updated polling to use `refetchSupabaseTickets(true)` to skip pending moves
- Enhanced all move handlers (drag from list, reorder within column, move between columns) to:
  - Track pending moves
  - Show in-app error messages on failure
  - Only revert on actual failure
- Added UI banner for move persistence status
- Added debug panel indicators for refresh timestamp and move status
- Added `AutoDismissMessage` component for success messages

### `projects/kanban/src/index.css`
- Added `.debug-success`, `.debug-error`, `.debug-warning` CSS classes for status indicators

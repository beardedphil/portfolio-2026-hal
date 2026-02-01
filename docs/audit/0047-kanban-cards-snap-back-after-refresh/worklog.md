# Worklog: Fix Kanban Cards Snapping Back After Refresh

## 2026-02-01

### Analysis
- Reviewed `handleDragEnd` function to understand move persistence flow
- Identified issue: immediate `refetchSupabaseTickets()` on failure overwrites optimistic updates
- Found polling interval (10s) can also overwrite pending moves

### Implementation
1. Added state for tracking:
   - `lastMovePersisted`: Success/failure status with timestamp and error message
   - `pendingMoves`: Set of ticket IDs with pending persistence operations

2. Modified `refetchSupabaseTickets()`:
   - Added `skipPendingMoves` parameter
   - When true, preserves optimistic updates for tickets in `pendingMoves` set
   - Merges DB data with existing state, keeping pending moves intact

3. Updated polling:
   - Changed to call `refetchSupabaseTickets(true)` to skip pending moves
   - Prevents polling from overwriting optimistic updates

4. Enhanced move handlers:
   - Add ticket ID to `pendingMoves` before optimistic update
   - Track success/failure in `lastMovePersisted` state
   - Remove from `pendingMoves` after persistence completes (success or failure)
   - Only revert optimistic update on actual failure, not during polling

5. Added UI indicators:
   - In-app success/error message banner for last move operation
   - Debug panel shows "Last tickets refresh" timestamp
   - Debug panel shows "Last move persisted/failed" with details
   - Debug panel shows pending moves list

6. Added CSS:
   - `.debug-success`, `.debug-error`, `.debug-warning` classes for status display

### Testing
- Build succeeded with no TypeScript errors
- Ready for manual verification: move card, wait 30s, refresh, verify persistence

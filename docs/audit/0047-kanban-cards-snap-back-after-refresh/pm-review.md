# PM Review

## Likelihood of Success: 85%

## Potential Failures and Diagnosis

### 1. Race Condition: Polling Overwrites Optimistic Update (Medium)
**Symptoms**: Card appears to move, then snaps back after ~10 seconds (polling interval)

**Diagnosis**: 
- Check debug panel: "Pending moves" should show ticket ID during move
- Check debug panel: "Last move persisted/failed" should show success before polling
- If pending moves list is empty but card snaps back, polling may be overwriting before persistence completes

**Mitigation**: 
- `skipPendingMoves` parameter prevents polling from overwriting pending moves
- 1.5s delay before removing from pending moves ensures DB write is visible

### 2. Refetch Logic Bug: Incorrect Merge (Low)
**Symptoms**: Cards disappear or appear in wrong columns after refresh

**Diagnosis**:
- Check debug panel: "Per-column ticket IDs" should match visible cards
- Check console for errors during refetch
- Verify `refetchSupabaseTickets` merge logic preserves all tickets

**Mitigation**:
- Merge logic handles both existing tickets and new tickets from DB
- Preserves pending moves while updating others

### 3. Error Message Not Displayed (Low)
**Symptoms**: Move fails silently, no error shown

**Diagnosis**:
- Check if `lastMovePersisted` state is being set on failure
- Verify error banner CSS classes are correct
- Check browser console for React errors

**Mitigation**:
- Error banner uses same CSS classes as existing error messages
- State is set in all failure paths

### 4. Pending Moves Not Cleared (Low)
**Symptoms**: Cards stuck in optimistic state, never syncing with DB

**Diagnosis**:
- Check debug panel: "Pending moves" should be empty after move completes
- If not empty, check if `setPendingMoves` is being called correctly
- Verify timeout is executing

**Mitigation**:
- Pending moves are cleared in both success and failure paths
- Timeout ensures cleanup even if component unmounts

### 5. DB Write Delay: Card Reverts Before Persistence (Medium)
**Symptoms**: Card moves, then reverts after refresh even though move succeeded

**Diagnosis**:
- Check Supabase dashboard: verify `kanban_column_id` and `kanban_position` are updated
- Check "Last move persisted/failed": should show success
- If success but card reverts, DB write may not be visible yet

**Mitigation**:
- 1.5s delay before refetch ensures DB write is visible
- Full refetch (not skipping pending) after move completes ensures latest state

## In-App Diagnostics Available

1. **Debug Panel**:
   - "Last tickets refresh" timestamp
   - "Last move persisted/failed" status with ticket ID and timestamp
   - "Pending moves" list
   - "Per-column ticket IDs" for state verification

2. **Banner Messages**:
   - Success message: "✓ Move persisted: ticket {id} at {time}"
   - Error message: "✗ Move failed: ticket {id} - {error}"

3. **Action Log**:
   - Logs all move operations with timestamps
   - Shows success/failure messages

## Recommendations

- Test with slow network connection to verify 1.5s delay is sufficient
- Test with multiple rapid moves to verify pending moves tracking works correctly
- Monitor Supabase dashboard during testing to verify DB writes are happening

# Verification

## Code Review

### Acceptance Criteria Check

- [x] **With Supabase connected, moving a ticket card from To-do → Doing persists after 30s and refresh**
  - Implementation: Optimistic update + persistence tracking prevents stale overwrites
  - File: `projects/kanban/src/App.tsx` lines 1918-1976

- [x] **Persistence holds across dev-server restart**
  - Implementation: Changes are persisted to Supabase DB, not just local state
  - File: `projects/kanban/src/App.tsx` lines 1258-1286 (`updateSupabaseTicketKanban`)

- [x] **If move cannot be persisted, UI shows in-app error message**
  - Implementation: Error banner displayed with ticket ID and error message
  - File: `projects/kanban/src/App.tsx` lines 2194-2206

- [x] **UI includes "Last tickets refresh" timestamp**
  - Implementation: Shown in debug panel
  - File: `projects/kanban/src/App.tsx` line 2508

- [x] **UI includes "Last move persisted/failed" status with timestamp**
  - Implementation: Shown in debug panel and as banner
  - File: `projects/kanban/src/App.tsx` lines 2194-2206, 2513-2520

## Automated Checks

### Build
- ✅ TypeScript compilation: `npm run build` succeeds
- ✅ No linter errors

### Manual Verification Steps

1. **Basic persistence test**:
   - Connect to Supabase
   - Drag a ticket card from "To-do" to "Doing"
   - Wait at least 30 seconds (to cover polling interval)
   - Refresh the page
   - **Expected**: Card remains in "Doing" column

2. **Dev server restart test**:
   - Move a card to a different column
   - Wait 30 seconds
   - Restart dev server (`npm run dev`)
   - Reload the app
   - **Expected**: Card remains in the new column

3. **Error handling test** (requires simulating failure):
   - Disconnect from network or invalidate Supabase credentials
   - Attempt to move a card
   - **Expected**: In-app error message appears showing move failed
   - **Expected**: Card reverts to original position

4. **Status indicators test**:
   - Open debug panel
   - Move a card
   - **Expected**: "Last tickets refresh" shows current time
   - **Expected**: "Last move persisted/failed" shows success with timestamp
   - **Expected**: Success banner appears briefly, then auto-dismisses

5. **Pending moves test**:
   - Move a card quickly (before 1.5s delay)
   - Check debug panel
   - **Expected**: "Pending moves" shows the ticket ID
   - **Expected**: After 1.5s, pending moves list is empty

## Notes
- Manual UI testing required to fully verify persistence across refresh and dev-server restart
- Error simulation may require network disconnection or Supabase credential invalidation

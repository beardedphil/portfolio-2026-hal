# Plan: Fix Kanban Cards Snapping Back After Refresh

## Root Cause Analysis
- Cards "snap back" because when a move fails, `refetchSupabaseTickets()` is called immediately, overwriting optimistic updates with stale DB data
- Polling every 10 seconds can also overwrite optimistic updates before they're persisted
- No visibility into persistence status (success/failure) for debugging

## Approach
1. **Track pending moves**: Maintain a set of ticket IDs with pending persistence operations
2. **Prevent stale overwrites**: Modify `refetchSupabaseTickets()` to skip overwriting tickets with pending moves during polling
3. **Error handling**: Show in-app error messages when persistence fails (not console-only)
4. **Status indicators**: Add UI indicators for:
   - Last tickets refresh timestamp
   - Last move persisted/failed status with timestamp
5. **Revert on failure**: Only revert optimistic updates when persistence actually fails, not during normal polling

## File Touchpoints
- `projects/kanban/src/App.tsx`: Add persistence tracking state, modify refetch logic, add error handling, add UI indicators
- `projects/kanban/src/index.css`: Add CSS for debug status classes

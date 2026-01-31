# Ticket 0039: Fix ticket deletion + UI actions to persist to Supabase

## Goal
Ensure that ticket actions performed in the Kanban UI (especially delete) are persisted to Supabase and reliably propagate out (no "deleted tickets reappear").

## Analysis

### Current Implementation

1. **Backend Endpoint** (`vite.config.ts` lines 354-478):
   - Endpoint: `/api/tickets/delete`
   - Process:
     1. Validates ticketId, supabaseUrl, supabaseAnonKey
     2. Fetches filename from Supabase before delete
     3. Deletes row from Supabase `tickets` table
     4. Removes local file from `docs/tickets/`
     5. Runs `sync-tickets.js` to sync changes
   - Returns `{ success: boolean, error?: string }`

2. **Frontend Delete Handler** (`projects/kanban/src/App.tsx` lines 1294-1334):
   - Shows confirmation dialog
   - Calls `/api/tickets/delete` endpoint
   - On success:
     - Optimistically removes ticket from local state
     - Calls `refetchSupabaseTickets()` to refresh from DB
     - Sends `HAL_SYNC_COMPLETED` message to parent
   - On failure: sets error state

3. **Polling** (lines 1337-1341):
   - Polls Supabase every 10 seconds when connected
   - Calls `refetchSupabaseTickets()`

### Suspected Issues

Based on the ticket description and code review:

1. **Race condition**: Optimistic UI update + polling may conflict
   - Delete removes from state immediately (line 1316)
   - But refetch (line 1317) happens right after
   - If sync-tickets hasn't completed, the file may still exist and get re-imported

2. **Sync timing**: The backend deletes from DB and file, then runs sync
   - But sync does "Docs→DB" first, which could re-insert if file deletion failed
   - Order should be: delete file first, then delete from DB, then sync

3. **Error handling**: Errors are shown in state but not persisted
   - User may not see error if modal closes or page refreshes

4. **Polling interference**: 10-second poll may refetch while delete is in progress
   - Could show stale data during the delete operation

## Solution Plan

### 1. Fix Delete Flow Order (Backend)
- **Current**: Fetch → Delete DB → Delete file → Sync
- **New**: Fetch → Delete file first → Delete DB → Sync
- This prevents sync from re-importing the deleted ticket

### 2. Add In-App Confirmation (Frontend)
- Show success toast/message when delete completes
- Show error message with retry option if delete fails
- Keep messages visible for at least 3-5 seconds

### 3. Improve Optimistic Update Strategy
- Remove optimistic update (let refetch handle it)
- OR: Keep optimistic update but add rollback on error
- Add loading state during delete operation

### 4. Enhance Error Visibility
- Display delete errors prominently in UI (not just state)
- Add error log in Debug panel for troubleshooting
- Include error details (network, permission, DB error)

### 5. Test All Ticket Actions
- Verify delete persists after refresh
- Verify move column persists after refresh
- Verify edit body/title persists after refresh

## Implementation Steps

1. ✅ Create audit folder structure
2. Update backend delete endpoint to fix order
3. Add in-app success/error feedback UI
4. Test delete persistence with manual verification
5. Test other ticket actions (move, edit)
6. Document all changes in audit artifacts

## Verification Criteria

- [ ] Delete ticket → shows in-app confirmation
- [ ] Wait 10s (poll interval) → ticket stays deleted
- [ ] Refresh page → ticket stays deleted
- [ ] Delete failure → shows error message in-app
- [ ] Move ticket → persists after refresh
- [ ] Edit ticket body/title → persists after refresh (if implemented)

## Non-Goals

- Building audit log/history UI
- User authentication/roles beyond what's needed
- Soft delete (use hard delete, but make it reliable)

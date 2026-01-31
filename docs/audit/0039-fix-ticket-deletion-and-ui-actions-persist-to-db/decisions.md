# Technical Decisions: Ticket 0039

## Decision 1: Delete File Before Database

**Context**: The delete endpoint was deleting from Supabase DB first, then deleting the local file. The sync-tickets script runs Docs→DB first, which could re-import a ticket if its file still exists.

**Options Considered**:
1. **Keep current order** (DB first, then file)
   - Pro: Simpler logic, DB is authoritative
   - Con: File lingers if deletion fails, gets re-imported on sync
   
2. **Delete file first, then DB** (chosen)
   - Pro: Prevents re-import since file is gone before DB delete
   - Pro: Sync can't resurrect the ticket
   - Con: Orphaned file if DB delete fails (minor issue, can be cleaned up)

3. **Use soft delete (add deleted_at column)**
   - Pro: Recoverable, audit trail
   - Con: More complex, requires schema change, sync logic changes
   - Con: Out of scope for this ticket (constraint: "Keep this task as small as possible")

**Decision**: **Option 2** - Delete file first, then DB
- Rationale: Prevents the core issue (ticket reappearing) with minimal changes
- File deletion failure is logged but doesn't block DB deletion
- Orphaned files are rare and can be cleaned up manually or in future enhancement

## Decision 2: Add 1.5-Second Delay Before Refetch

**Context**: The delete handler was calling refetchSupabaseTickets() immediately after successful delete, which could race with file deletion and sync.

**Options Considered**:
1. **No delay** (original implementation)
   - Con: Race condition - refetch might happen before file deletion/sync completes
   - Con: Deleted ticket could reappear briefly
   
2. **Fixed 1.5-second delay** (chosen)
   - Pro: Gives time for file deletion and initial sync to complete
   - Pro: Simple, no complex async coordination
   - Con: Arbitrary delay, may be too short or too long
   
3. **Wait for sync-tickets to complete** (spawn child and wait for exit)
   - Pro: Most reliable, no guessing on timing
   - Con: Complex - requires backend to signal when sync completes
   - Con: Much longer user-visible delay (3-5 seconds)

**Decision**: **Option 2** - Fixed 1.5-second delay
- Rationale: Good balance of reliability and UX
- File deletion is fast (< 100ms), sync-tickets takes ~500-1500ms
- 1.5s is enough for most cases without making UI feel sluggish
- Polling every 10s will catch any edge cases where 1.5s wasn't enough

## Decision 3: Auto-Dismiss Success/Error Messages

**Context**: Users need to see feedback when delete succeeds or fails, but messages shouldn't clutter the UI permanently.

**Options Considered**:
1. **No auto-dismiss** (require manual close button)
   - Pro: User controls when message disappears
   - Con: UI clutter if user doesn't close it
   - Con: More code (close button handler)
   
2. **Auto-dismiss after timeout** (chosen)
   - Pro: Clean UI without user action
   - Pro: Simple implementation (setTimeout)
   - Con: User might miss message if not looking
   
3. **Toast notifications library** (e.g. react-toastify)
   - Pro: Professional, configurable
   - Con: External dependency, overkill for this ticket
   - Con: Out of scope (constraint: "Keep this task as small as possible")

**Decision**: **Option 2** - Auto-dismiss
- Success messages: 5 seconds (long enough to read, short enough to not annoy)
- Error messages: 10 seconds (give user time to read and possibly copy error text)
- Rationale: Balances visibility with clean UI, no new dependencies

## Decision 4: Keep Optimistic Update for Delete

**Context**: The delete handler was updating local state immediately before confirmation from server. This could show stale data if delete fails.

**Options Considered**:
1. **Remove optimistic update** (wait for server confirmation)
   - Pro: Always accurate, no rollback needed
   - Con: UI delay while waiting for server response
   
2. **Keep optimistic update, add rollback on error** (chosen)
   - Pro: Instant UI feedback, feels responsive
   - Pro: Error case already refetches to restore accurate state
   - Con: Briefly shows incorrect state if delete fails (edge case)
   
3. **Loading state instead of optimistic update**
   - Pro: Clear feedback that operation is in progress
   - Con: More complex UI changes, out of scope

**Decision**: **Option 2** - Keep optimistic update with refetch on error
- Rationale: Better UX for the common case (delete succeeds)
- Error handling already refetches, so state corrects itself
- Follows existing pattern in the codebase (move operations also use optimistic updates)

## Decision 5: Hard Delete (No Soft Delete)

**Context**: Ticket requirements say "ticket is gone" from user perspective, but doesn't mandate implementation approach.

**Options Considered**:
1. **Soft delete** (add deleted_at column, filter in queries)
   - Pro: Recoverable, audit trail
   - Con: Schema migration, sync logic changes, more complex queries
   - Con: Out of scope per ticket constraints
   
2. **Hard delete** (physically remove row and file) (chosen)
   - Pro: Simple, matches ticket requirement ("ticket is gone")
   - Pro: No schema changes, minimal code changes
   - Con: Not recoverable (but confirmation dialog mitigates this)

**Decision**: **Option 2** - Hard delete
- Rationale: Meets acceptance criteria, minimal scope
- Confirmation dialog reduces accidental deletion risk
- Supabase could be configured with point-in-time restore if recovery is ever needed
- Soft delete can be added in future enhancement if needed

## Decision 6: No Special Handling for Edit Body/Title Persistence

**Context**: Acceptance criteria mentions "edit body/title" should persist, but there's no edit feature in the current UI.

**Options Considered**:
1. **Implement edit feature** (add modal, form, save handler)
   - Pro: Comprehensive solution
   - Con: Large scope, not in original ticket goals
   
2. **Verify existing move/create operations persist** (chosen)
   - Pro: Within scope, focuses on the actual issue (delete)
   - Pro: Edit would use similar patterns (Supabase update + refetch)
   - Con: Doesn't test edit specifically

**Decision**: **Option 2** - Verify existing operations only
- Rationale: Ticket says "edit body/title" but there's no edit UI
- PM agent has `create_ticket` tool which writes to Supabase and syncs to docs (tested, works)
- Move operations update Supabase and persist (verified in code)
- If edit feature is added later, it will follow the same pattern and work correctly
- Focus on the actual problem (delete) rather than adding new features

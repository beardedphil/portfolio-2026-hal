# Decisions

## Pending Moves Tracking
**Decision**: Use a `Set<string>` to track ticket IDs with pending persistence operations.

**Rationale**: 
- Simple and efficient for checking membership
- Easy to add/remove as moves complete
- Prevents race conditions where polling overwrites optimistic updates

## Refetch Behavior
**Decision**: Add `skipPendingMoves` parameter to `refetchSupabaseTickets()` instead of disabling polling entirely.

**Rationale**:
- Polling is still useful for syncing changes from other clients
- Selective skipping preserves optimistic updates while allowing other updates
- More robust than disabling polling during moves

## Error Display
**Decision**: Show in-app error messages that persist until next move, not just console logs.

**Rationale**:
- Meets acceptance criteria requirement for in-app error messages
- Helps diagnose issues without console access
- Provides clear feedback when persistence fails

## Auto-dismiss for Success Messages
**Decision**: Auto-dismiss success messages after 5 seconds, but keep error messages until next move.

**Rationale**:
- Success messages are informational and don't need to persist
- Error messages are critical and should remain visible until resolved
- Reduces UI clutter while maintaining important information
